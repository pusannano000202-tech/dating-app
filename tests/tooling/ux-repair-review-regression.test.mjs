import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const read=f=>readFileSync(new URL('../../'+f,import.meta.url),'utf8')
const parse=f=>ts.createSourceFile(f,read(f),ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX)
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
const find=(root,predicate)=>{let result;function visit(node){if(predicate(node))result=node;else ts.forEachChild(node,visit)}visit(root);return result}
test('saved content details and login keep the current filter, not the initial filter',()=>{
 const ast=parse('components/content-history/ContentHistoryHub.tsx')
 const body=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ContentHistoryHub').body
 const kindFn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='kindForLink')
 const query=find(body,n=>ts.isVariableDeclaration(n)&&n.name.getText()==='kindQuery')
 const detail=find(body,n=>ts.isJsxAttribute(n)&&n.name.text==='href'&&n.initializer?.getText().includes('encodeURIComponent(item.id)'))
 const login=find(body,n=>ts.isJsxAttribute(n)&&n.name.text==='href'&&n.initializer?.getText().includes('/login?next='))
 for(const kind of ['visit','places','']){
  const context=compile(kindFn.getText())+';const kindQuery='+query.initializer.getText()+';const listHref=historyRoot+kindQuery;'
  const run=expr=>new Function('kind','initialKind','historyRoot','item','recordId',context+'return '+expr) (kind,'visit','/community/content-history',{id:'abc'},'abc')
  const expected='/community/content-history/abc'+(kind?'?type='+kind:'')
  assert.equal(run(detail.initializer.expression.getText()),expected)
  assert.equal(new URL(run(login.initializer.expression.getText()),'http://localhost').searchParams.get('next'),expected)
 }
 for(const route of ['app/community/content-history/[id]/page.tsx','app/profile/content-history/[recordId]/page.tsx']){
  const prop=find(parse(route),n=>ts.isJsxAttribute(n)&&n.name.text==='initialKind')
  assert.ok(prop)
  const value=new Function('type','return '+prop.initializer.expression.getText())
  for(const type of ['visit','places','x',undefined,['visit']])assert.equal(value(type),type==='visit'||type==='places'?type:'')
 }
})
test('the embedded league schedule exposes a rejected operation without discarding the form',async()=>{
 const ast=parse('components/community/department/DepartmentLeagueJourney.tsx')
 const body=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='DepartmentLeagueJourney').body
 const op=body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='operation')
 let notice='',busy=false;const lock={current:false}
 const operation=new Function('operationMutation','busy','connection','setBusy','setNotice','recruitmentError',compile(op.getText())+';return operation')(lock,false,'ready',value=>busy=value,value=>notice=value,()=> '팀 정보가 바뀌었어요. 다시 확인해 주세요.')
 await operation(async()=>{throw Error('stale_revision')})
 assert.equal(busy,false);assert.equal(lock.current,false);assert.ok(notice)
 const branch=body.statements.find(n=>ts.isIfStatement(n)&&n.expression.getText()==='coordinationOnly')
 const jsx=(type,props)=>({type,props}),require=()=>({jsx,jsxs:jsx})
 const render=new Function('exports','require','coordinationOnly','styles','notice','t','ready','selected','team','schedulePanel',compile('function render(){'+branch.getText()+'};')+';return render()')
 const form={type:'form',props:{children:'입력 중인 날짜와 장소'}}
 const tree=render({},require,true,{},notice,v=>v,true,{}, {},form)
 const nodes=[];function walk(n){if(!n)return;if(Array.isArray(n)){n.forEach(walk);return}nodes.push(n);if(typeof n==='object')walk(n.props?.children)}walk(tree)
 assert.ok(nodes.some(n=>n?.props?.role==='alert'));assert.ok(nodes.includes(notice));assert.ok(nodes.includes(form))
})
