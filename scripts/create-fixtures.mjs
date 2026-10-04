import { writeFile } from 'node:fs/promises';
const code = (name, rules) => `puzzle "${name}" do\n  size 3, 3\n  colors :red, :blue\n${rules.map(([n,e]) => `\n  rule "${n}" do |b|\n    ${e}\n  end`).join('\n')}\nend\n`;
const samples = [
 {id:'apart',name:'赤を3つ、くっつけずに',description:'赤の数と、隣り合う関係を考える。',code:code('赤を3つ、くっつけずに', [['赤はちょうど3マス','b.count(:red) == 3'],['赤どうしは上下左右に隣り合わない','!b.adjacent?(:red)']])},
 {id:'rows',name:'一列に、ひとつずつ',description:'それぞれの行と列に、赤をひとつ。',code:code('一列に、ひとつずつ', [['各行に赤を1つ','b.row_count(1, :red) == 1 && b.row_count(2, :red) == 1 && b.row_count(3, :red) == 1'],['各列に赤を1つ','b.col_count(1, :red) == 1 && b.col_count(2, :red) == 1 && b.col_count(3, :red) == 1']])},
 {id:'center',name:'まんなかは赤',description:'まんなかから始まる、小さな推理。',code:code('まんなかは赤', [['まんなかは赤','b.cell(2, 2) == :red'],['赤はちょうど4マス','b.count(:red) == 4'],['1行目の青は2マス','b.row_count(1, :blue) == 2']])},
 {id:'none',name:'あれ？ 解がない',description:'矛盾するルールを直してみよう。',code:code('あれ？ 解がない', [['赤は3マス','b.count(:red) == 3'],['でも赤は4マス','b.count(:red) == 4']])}
];
await writeFile('src/samples.json', JSON.stringify(samples,null,2)+'\n');
const cases = [
 {id:'unconstrained',code:code('自由な盤面',[]),count:512},
 {id:'three',code:code('赤3つ',[['赤3','b.count(:red) == 3']]),count:84},
 ...samples.map((s,i)=>({id:s.id,code:s.code,count:[22,6,30,0][i]})),
 {id:'logic',code:code('論理演算',[['論理','(b.count(:red) >= 3 && b.count(:red) <= 3) && b.cell(1, 1) != :blue']]),count:28}
];
await writeFile('test/fixtures.json',JSON.stringify(cases,null,2)+'\n');
