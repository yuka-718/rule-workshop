# frozen_string_literal: true
require 'ripper'
require 'json'

module RuleWorkshop
  MAX_BYTES = 8192
  MAX_RULES = 24
  class InputError < StandardError
    attr_reader :line, :column
    def initialize(message, line = nil, column = nil)
      super(message)
      @line, @column = line, column
    end
  end

  class SyntaxTree < Ripper::SexpBuilderPP
    attr_reader :syntax_error
    def on_parse_error(_message)
      @syntax_error ||= [lineno, column + 1]
    end
  end

  class Board
    include Enumerable
    attr_reader :cells
    def initialize(cells)
      raise InputError, '盤面は赤・青の9マスにしてください。' unless cells.is_a?(Array) && cells.size == 9 && cells.all? { |c| [:red, :blue].include?(c) }
      @cells = cells.freeze
    end
    def each(&block); @cells.each(&block); end
    def cell(row, col); @cells[(row - 1) * 3 + col - 1]; end
    def row_count(row, color); @cells.slice((row - 1) * 3, 3).count(color); end
    def col_count(col, color); (1..3).count { |row| cell(row, col) == color }; end
    def adjacent?(color)
      (1..3).any? do |r|
        (1..3).any? { |c| cell(r, c) == color && ((r < 3 && cell(r + 1, c) == color) || (c < 3 && cell(r, c + 1) == color)) }
      end
    end
    def matches?(hints); hints.each_with_index.all? { |v, i| v.nil? || @cells[i] == v }; end
  end

  Rule = Struct.new(:name, :predicate) do
    def satisfied?(board); predicate.call(board); end
  end
  Puzzle = Struct.new(:name, :rules) do
    def satisfied?(board); rules.all? { |rule| rule.satisfied?(board) }; end
  end

  # No user code is executed. Ripper nodes are checked and compiled into a small
  # collection of author-owned Procs, with static argument and result types.
  class Parser
    def reject!(message = '未対応の構文です。書き方ガイドの構文だけを使ってください。')
      location = location_of(@context)
      raise InputError.new(message, *location)
    end
    def location_of(node)
      return [] unless node.is_a?(Array)
      if node[0].is_a?(Symbol) && node[0].to_s.start_with?('@') && node[2].is_a?(Array)
        return [node[2][0], node[2][1] + 1]
      end
      node.each do |child|
        found = location_of(child)
        return found unless found.empty?
      end
      []
    end
    def parse(code)
      reject!('ルールはUTF-8の8,192バイト以内にしてください。') unless code.is_a?(String) && code.valid_encoding? && code.bytesize <= MAX_BYTES
      @context = nil
      reader = SyntaxTree.new(code)
      tree = reader.parse
      if reader.syntax_error || !tree
        raise InputError.new('Rubyの構文エラーです。括弧、do / end、引用符を確認してください。', *(reader.syntax_error || []))
      end
      reject!('__END__ によるデータの埋め込みには対応していません。') if Ripper.lex(code).any? { |token| token[1] == :on___end__ }
      @nodes = 0
      check_tree(tree)
      root = tree[1]
      reject!('puzzle のブロックを1つだけ書いてください。') unless root.size == 1
      outer = root.first
      @context = outer
      reject! unless outer[0] == :method_add_block
      name = string(single(command(outer[1], 'puzzle')))
      block = outer[2]
      reject! unless block[0] == :do_block && block[1].nil?
      statements = body(block[2])
      reject!('最初に size 3, 3 と colors :red, :blue を指定してください。') unless statements.size >= 2
      reject!('初版の盤面サイズは3×3です。') unless command(statements[0], 'size').map { |n| integer(n) } == [3, 3]
      reject!('色は :red, :blue の順に指定してください。') unless command(statements[1], 'colors').map { |n| color(n) } == [:red, :blue]
      reject!('ルールは24個以内にしてください。') if statements.size - 2 > MAX_RULES
      rules = statements.drop(2).map do |stmt|
        reject! unless stmt[0] == :method_add_block
        label = string(single(command(stmt[1], 'rule')))
        b = stmt[2]
        reject!('rule は do |b| ... end の形にしてください。') unless b[0] == :do_block
        vars = b[1]
        reject!('ブロック引数は |b| のみ対応しています。') unless vars && vars[0] == :block_var && vars[2] == false
        params = vars[1]
        reject! unless params[0] == :params && params[1]&.size == 1 && params[1][0][0..1] == [:@ident, 'b'] && params.drop(2).all?(&:nil?)
        type, predicate = expression(single(body(b[2])))
        reject!('各ルールは true / false になる式にしてください。例：b.count(:red) == 3') unless type == :boolean
        Rule.new(label, predicate)
      end
      Puzzle.new(name, rules)
    end
    def check_tree(node, depth = 0)
      return unless node.is_a?(Array)
      @nodes += 1
      reject!('式が複雑すぎます。短いルールに分けてください。') if depth > 64 || @nodes > 2048
      node.each { |child| check_tree(child, depth + 1) }
    end
    def single(nodes)
      reject!('引数または式は1つだけ指定してください。') unless nodes.is_a?(Array) && nodes.size == 1
      nodes.first
    end
    def body(node)
      reject! unless node && node[0] == :bodystmt && node.drop(2).all?(&:nil?)
      node[1].reject { |n| n == [:void_stmt] }
    end
    def args(node)
      reject! unless node && node[0] == :args_add_block && node[2] == false && node[1].is_a?(Array)
      node[1]
    end
    def command(node, expected)
      @context = node
      reject!("#{expected} の書き方を確認してください。") unless node && node[0] == :command && node[1][0..1] == [:@ident, expected]
      args(node[2])
    end
    def string(node)
      reject!('名前は式展開を含まない文字列にしてください。') unless node && node[0] == :string_literal && node[1][0] == :string_content && node[1].drop(1).all? { |n| n[0] == :@tstring_content }
      value = node[1].drop(1).map { |n| n[1] }.join
      reject!('名前は1〜80文字にしてください。') unless (1..80).cover?(value.length)
      value
    end
    def integer(node)
      reject!('数値は0〜9の整数リテラルで指定してください。') unless node && node[0] == :@int && /\A[0-9]\z/.match?(node[1])
      node[1].to_i
    end
    def color(node)
      reject!('色は :red または :blue です。') unless node && node[0] == :symbol_literal && node[1][0] == :symbol && node[1][1][0] == :@ident
      case node[1][1][1]
      when 'red' then :red
      when 'blue' then :blue
      else reject!('色は :red または :blue です。')
      end
    end
    def coordinate(node)
      n = integer(node)
      reject!('行・列は1〜3で指定してください。') unless (1..3).cover?(n)
      n
    end
    def expression(node)
      @context = node
      reject! unless node.is_a?(Array)
      case node[0]
      when :@int
        value = integer(node); [:number, ->(_b) { value }]
      when :symbol_literal
        value = color(node); [:color, ->(_b) { value }]
      when :var_ref
        reject! unless node[1][0] == :@kw && ['true', 'false'].include?(node[1][1])
        value = node[1][1] == 'true'; [:boolean, ->(_b) { value }]
      when :paren
        expression(single(node[1]))
      when :unary
        type, proc = expression(node[2])
        reject!('! は真偽値の式に使ってください。') unless node[1] == :! && type == :boolean
        [:boolean, ->(b) { !proc.call(b) }]
      when :binary
        lt, left = expression(node[1]); rt, right = expression(node[3]); op = node[2]
        reject!('比較する値の型をそろえてください。') unless lt == rt
        predicate = case op
        when :== then ->(b) { left.call(b) == right.call(b) }
        when :!= then ->(b) { left.call(b) != right.call(b) }
        when :<, :<=, :>, :>=
          reject!('大小比較は数値同士で行ってください。') unless lt == :number
          case op
          when :< then ->(b) { left.call(b) < right.call(b) }
          when :<= then ->(b) { left.call(b) <= right.call(b) }
          when :> then ->(b) { left.call(b) > right.call(b) }
          when :>= then ->(b) { left.call(b) >= right.call(b) }
          end
        when :'&&', :'||'
          reject!('&& と || は真偽値の式に使ってください。') unless lt == :boolean
          op == :'&&' ? ->(b) { left.call(b) && right.call(b) } : ->(b) { left.call(b) || right.call(b) }
        else reject!('演算子は == != < <= > >= && || ! に対応しています。')
        end
        [:boolean, predicate]
      when :method_add_arg
        call = node[1]
        receiver = call[1]
        reject!('盤面 b の対応メソッドだけが使えます。') unless call[0] == :call && receiver.is_a?(Array) && receiver[0] == :var_ref && receiver[1].is_a?(Array) && receiver[1][0..1] == [:@ident, 'b'] && call[2].is_a?(Array) && call[2][0..1] == [:@period, '.'] && call[3][0] == :@ident
        reject! unless node[2]&.first == :arg_paren
        values = args(node[2][1]); method = call[3][1]
        # Deliberately explicit dispatch; never send/public_send from input.
        case method
        when 'count', 'adjacent?'
          c = color(single(values))
          method == 'count' ? [:number, ->(b) { b.count(c) }] : [:boolean, ->(b) { b.adjacent?(c) }]
        when 'cell'
          reject! unless values.size == 2
          r, c = values.map { |v| coordinate(v) }
          [:color, ->(b) { b.cell(r, c) }]
        when 'row_count', 'col_count'
          reject! unless values.size == 2
          n = coordinate(values[0]); c = color(values[1])
          method == 'row_count' ? [:number, ->(b) { b.row_count(n, c) }] : [:number, ->(b) { b.col_count(n, c) }]
        else reject!('対応メソッド：count、cell、row_count、col_count、adjacent?')
        end
      else reject!
      end
    end
  end

  class Solver
    attr_reader :solutions, :rule_stats
    def initialize(puzzle)
      @solutions = (0...512).map { |n| Board.new((0...9).map { |i| n[i] == 1 ? :red : :blue }) }
      @rule_stats = puzzle.rules.map do |rule|
        before = @solutions.size
        @solutions = @solutions.select { |board| rule.satisfied?(board) }
        { name: rule.name, before: before, remaining: @solutions.size }
      end
    end
    def with_hints(hints); @solutions.select { |board| board.matches?(hints) }; end
  end

  class Generator
    def initialize(solver); @solver = solver; end
    def generate(seed)
      raise InputError, '解がありません。条件をゆるめてから問題を作ってください。' if @solver.solutions.empty?
      raise InputError, 'seed は0〜2,147,483,647の整数です。' unless seed.is_a?(Integer) && (0..2147483647).cover?(seed)
      rng = Random.new(seed)
      answer = @solver.solutions[rng.rand(@solver.solutions.size)]
      hints = answer.cells.dup
      (0...9).to_a.shuffle(random: rng).each do |i|
        old = hints[i]; hints[i] = nil
        hints[i] = old unless @solver.with_hints(hints).size == 1
      end
      raise InputError, '一意解の確認に失敗しました。' unless @solver.with_hints(hints).size == 1
      raise InputError, '全9マスの固定が必要で、遊ぶ空欄が残りません。ルールを追加してください。' unless hints.include?(nil)
      { hints: hints, hint_count: hints.compact.size, constrained_count: 1, seed: seed }
    end
  end

  module API
    def self.cells(value)
      raise InputError, '盤面データは9マスの配列にしてください。' unless value.is_a?(Array) && value.size == 9
      value.map do |v|
        case v
        when nil then nil
        when 'red' then :red
        when 'blue' then :blue
        else raise InputError, '盤面には未入力、red、blueだけを指定できます。'
        end
      end
    end
    def self.dispatch(request)
      raise InputError, 'リクエスト形式が正しくありません。' unless request.is_a?(Hash)
      puzzle = Parser.new.parse(request['code'])
      case request['action']
      when 'analyze', 'generate', 'restore'
        solver = Solver.new(puzzle)
        common = { name: puzzle.name, rules: puzzle.rules.map(&:name), count: solver.solutions.size }
        case request['action']
        when 'analyze'
          common.merge(previews: solver.solutions.first(12).map(&:cells), rule_stats: solver.rule_stats)
        when 'generate'
          common.merge(Generator.new(solver).generate(request['seed']))
        when 'restore'
          hints = cells(request['hints'])
          raise InputError, '共有問題が一意解になっていません。' unless solver.with_hints(hints).size == 1
          raise InputError, '共有問題に遊ぶ空欄がありません。' unless hints.include?(nil)
          common.merge(hints: hints, hint_count: hints.compact.size, constrained_count: 1)
        end
      when 'judge'
        hints = cells(request['hints']); input = cells(request['cells'])
        if hints.each_with_index.any? { |h, i| h && input[i] != h }
          return { status: 'incorrect', message: '固定ヒントと違うマスがあります。' }
        end
        return { status: 'incomplete', message: '入力中です。空いているマスを埋めてみましょう。' } if input.include?(nil)
        board = Board.new(input)
        results = puzzle.rules.map { |rule| { name: rule.name, passed: rule.satisfied?(board) } }
        failed = results.reject { |r| r[:passed] }.map { |r| r[:name] }
        { status: failed.empty? ? 'correct' : 'incorrect', failed: failed, results: results, message: failed.empty? ? 'できました！ すべてのルールを満たしています。' : 'あと少し。満たしていないルールを確認しましょう。' }
      else
        raise InputError, '未対応の操作です。'
      end
    end
    def self.handle(json)
      raise InputError, 'リクエストが大きすぎます。' if json.bytesize > 65536
      JSON.generate({ ok: true, result: dispatch(JSON.parse(json)) })
    rescue InputError => e
      JSON.generate({ ok: false, error: e.message, line: e.line, column: e.column })
    rescue JSON::ParserError
      JSON.generate({ ok: false, error: 'JSONデータが壊れています。' })
    end
  end
end
