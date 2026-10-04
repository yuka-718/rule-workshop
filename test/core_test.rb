# encoding: UTF-8
require 'minitest/autorun'
require_relative '../ruby/core'
class CoreTest < Minitest::Test
  R = RuleWorkshop
  FIXTURES = JSON.parse(File.read(File.join(__dir__, 'fixtures.json'), encoding: 'UTF-8'))
  def code(expr)
    "puzzle \"test\" do\n size 3, 3\n colors :red, :blue\n rule \"check\" do |b|\n #{expr}\n end\nend"
  end
  def solve(source); R::Solver.new(R::Parser.new.parse(source)); end
  def test_fixture_counts
    FIXTURES.each { |f| assert_equal f['count'], solve(f['code']).solutions.size, f['id'] }
  end
  def test_diagonal_is_not_adjacent
    assert_equal false, R::Board.new([:red,:blue,:blue,:blue,:red,:blue,:blue,:blue,:blue]).adjacent?(:red)
    assert R::Board.new([:red,:red,:blue,:blue,:blue,:blue,:blue,:blue,:blue]).adjacent?(:red)
    assert R::Board.new([:red,:blue,:blue,:red,:blue,:blue,:blue,:blue,:blue]).adjacent?(:red)
  end
  def test_generation_is_unique_and_reproducible
    FIXTURES.select { |f| f['count'] > 0 && f['count'] < 512 }.each do |f|
      solver = solve(f['code'])
      20.times do |seed|
        result = R::Generator.new(solver).generate(seed)
        assert_equal 1, solver.with_hints(result[:hints]).size
        assert_includes result[:hints], nil
        assert_equal result, R::Generator.new(solver).generate(seed)
        result[:hints].each_with_index do |hint,i|
          next if hint.nil?
          removed = result[:hints].dup; removed[i] = nil
          assert_operator solver.with_hints(removed).size, :>, 1
        end
      end
    end
  end
  def test_unplayable_generation
    assert_raises(R::InputError) { R::Generator.new(solve(FIXTURES.first['code'])).generate(1) }
    assert_raises(R::InputError) { R::Generator.new(solve(FIXTURES.find { |f| f['id'] == 'none' }['code'])).generate(1) }
  end
  def test_judging_and_empty_is_not_blue
    source = code('b.count(:red) == 0')
    request = {'action'=>'judge','code'=>source,'hints'=>['blue'] + [nil]*8,'cells'=>['blue']*9}
    assert_equal 'correct', R::API.dispatch(request)[:status]
    request['cells'][1] = nil
    assert_equal 'incomplete', R::API.dispatch(request)[:status]
    request['cells'][1] = 'blue'; request['cells'][0] = 'red'
    assert_equal 'incorrect', R::API.dispatch(request)[:status]
  end
  def test_rejects_unsupported_and_oversized_input
    ['Kernel.system("echo bad")', 'b.send(:count)', 'b.count(:green)', 'b.cell(0, 2) == :red',
     'loop { true }', 'require "json"', 'true || system("bad")', 'b.count(:red)',
     '"#{1}" == "1"', 'b.count(:red) == 100000', 'b.instance_eval("true")',
     'b = 1', 'while true; end', 'class X; end', 'def x; end', '`whoami`',
     'b.count(:red) && true', 'b.cell(1, 1) > :red', 'b.count(:red, &b)',
     'b&.count(:red) == 1', '3.count(:red) == 1', 'b::count(:red) == 1'].each do |expr|
      assert_raises(R::InputError, expr) { solve(code(expr)) }
    end
    assert_raises(R::InputError) { solve('x' * 8193) }
    assert_raises(R::InputError) { solve(code('('*70 + 'true' + ')'*70)) }
    assert_raises(R::InputError) { solve('puzzle "bad" do') }
    assert_raises(R::InputError) { solve(code('true').sub('rule "check"','rule "#{Kernel.exit}"')) }
    many = "puzzle \"many\" do\n size 3, 3\n colors :red, :blue\n" + "rule \"r\" do |b|\ntrue\nend\n" * 25 + 'end'
    assert_raises(R::InputError) { solve(many) }
  end
  def test_restore
    source = FIXTURES.find { |f| f['id'] == 'apart' }['code']
    generated = R::API.dispatch({'action'=>'generate','code'=>source,'seed'=>42})
    hints = JSON.parse(JSON.generate(generated[:hints]))
    restored = R::API.dispatch({'action'=>'restore','code'=>source,'hints'=>hints})
    assert_equal generated[:hints], restored[:hints]
    assert_equal 1, restored[:constrained_count]
    assert_raises(R::InputError) { R::API.dispatch({'action'=>'restore','code'=>source,'hints'=>[nil]*9}) }
  end
end
