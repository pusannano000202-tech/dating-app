import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import ts from 'typescript'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import sharp from 'sharp'
import postcss from 'postcss'

const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(import.meta.url),cache=new Map()
function ImageAdapter({priority,fill,unoptimized,loader,onLoadingComplete,...props}){return React.createElement('img',props)}
function load(file){
 if(file.endsWith('.json'))return JSON.parse(readFileSync(file,'utf8'))
 if(cache.has(file))return cache.get(file).exports
 const module={exports:{}};cache.set(file,module)
 const compiled=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
 new Function('require','module','exports',compiled)(specifier=>{
  if(specifier==='next/image')return{__esModule:true,default:ImageAdapter}
  if(specifier.endsWith('.module.css'))return{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})}
  if(specifier.startsWith('@/')||specifier.startsWith('.')){
   const base=specifier.startsWith('@/')?path.join(root,specifier.slice(2)):path.resolve(path.dirname(file),specifier)
   return load(base+(path.extname(base)?'':'.ts'))
  }
  return require(specifier)
 },module,module.exports)
 return module.exports
}
const ui=load(path.join(root,'components/community/department/LeagueTier.tsx'))
const emblems=load(path.join(root,'public/game-assets/lol-ranks/emblems.json'))
const css=postcss.parse(readFileSync(path.join(root,'components/community/department/league-tier.module.css'),'utf8'))
const expected=['iron','bronze','silver','gold','platinum','emerald','diamond','master','grandmaster','challenger']
const labels={iron:'아이언',bronze:'브론즈',silver:'실버',gold:'골드',platinum:'플래티넘',emerald:'에메랄드',diamond:'다이아몬드',master:'마스터',grandmaster:'그랜드마스터',challenger:'챌린저'}
const getLabel=tier=>labels[tier]
const markup=(component,props)=>renderToStaticMarkup(React.createElement(component,props))
function descendants(node,predicate){if(!node||typeof node!=='object')return[];return[...(predicate(node)?[node]:[]),...React.Children.toArray(node.props?.children).flatMap(child=>descendants(child,predicate))]}
function capturePicker(props){let tree;function Capture(){tree=ui.LeagueTierPicker(props);return tree}const html=markup(Capture,{});return{tree,html,inputs:descendants(tree,node=>node.type==='input')}}
function declarations(selector){const result={};css.walkRules(rule=>{if(rule.selector===selector)rule.walkDecls(decl=>{result[decl.prop]=decl.value})});return result}
function resolveFrame(art,availableWidth=Infinity){
 const maxWidth=art['max-width']?.endsWith('%')?availableWidth*parseFloat(art['max-width'])/100:parseFloat(art['max-width'])||Infinity
 const width=Math.min(parseFloat(art.width),maxWidth),ratioParts=(art['aspect-ratio']??'').split('/').map(Number),ratio=ratioParts[0]/(ratioParts[1]??1)
 const height=art.height==='auto'?width/ratio:parseFloat(art.height)
 assert.ok(Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0,'CSS resolves a finite nonzero frame')
 return{width,height}
}
const close=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,`${message}: ${actual} vs ${expected}`)

test('picker renders the ten official tiers as one required, labelled radio group',()=>{
 const {tree,html,inputs}=capturePicker({value:'emerald',onChange(){},label:'내 LoL 티어',getLabel})
 assert.equal(tree.type,'fieldset');assert.match(html,/<legend>내 LoL 티어<\/legend>/)
 assert.equal(inputs.length,10);assert.deepEqual(inputs.map(input=>input.props.value),expected)
 assert.equal(new Set(inputs.map(input=>input.props.name)).size,1)
 for(const input of inputs){assert.equal(input.props.type,'radio');assert.equal(input.props.required,true);assert.equal(input.props['aria-label'],labels[input.props.value]);assert.equal(input.props.checked,input.props.value==='emerald')}
 assert.equal((html.match(/<input\b/g)??[]).length,10);assert.equal((html.match(/ checked=""/g)??[]).length,1)
 for(const tier of expected){assert.ok(html.includes(`/game-assets/lol-ranks/${tier}.png`));assert.ok(html.includes(labels[tier]))}
})

test('picker selection callbacks return the selected tier and disabled fieldsets never dispatch',()=>{
 for(const disabled of [false,true]){
  const changes=[],{tree,html,inputs}=capturePicker({value:'gold',onChange:tier=>changes.push(tier),disabled,label:'티어 선택',getLabel})
  assert.equal(tree.props.disabled,disabled)
  if(disabled)assert.match(html,/<fieldset[^>]* disabled=""/)
  for(const input of inputs)input.props.onChange({target:{value:input.props.value}})
  assert.deepEqual(changes,disabled?[]:expected)
 }
 const changed=capturePicker({value:'challenger',onChange(){},label:'티어 선택',getLabel})
 assert.deepEqual(changed.inputs.filter(input=>input.props.checked).map(input=>input.props.value),['challenger'])
})

test('multiple pickers keep separate radio groups and an unknown selected value selects no tier',()=>{
 let first,second
 function Pair(){first=ui.LeagueTierPicker({value:'unknown',onChange(){},label:'첫 선택',getLabel});second=ui.LeagueTierPicker({value:'iron',onChange(){},label:'둘째 선택',getLabel});return React.createElement('div',null,first,second)}
 markup(Pair,{})
 const firstInputs=descendants(first,node=>node.type==='input'),secondInputs=descendants(second,node=>node.type==='input')
 assert.ok(firstInputs.every(input=>!input.props.checked));assert.notEqual(firstInputs[0].props.name,secondInputs[0].props.name)
})

test('unknown, inherited-object keys and empty tiers keep a text fallback even when labels are hidden',()=>{
 for(const tier of ['unranked','not-a-tier','constructor','toString','__proto__','',null,undefined]){
  const html=markup(ui.LeagueTierBadge,{tier,label:'티어 확인 필요',showLabel:false})
  assert.match(html,/티어 확인 필요/);assert.doesNotMatch(html,/<img\b/)
  assert.equal(ui.leagueEmblemStyle(tier??''),undefined)
 }
 const known=markup(ui.LeagueTierBadge,{tier:'emerald',label:'에메랄드'})
 assert.match(known,/<img[^>]+alt=""/);assert.match(known,/aria-hidden="true"/)
 assert.match(known,/<span class="name">에메랄드<\/span>/)
})

test('PNG dimensions, source hashes and alpha metadata match all ten unedited official originals',async()=>{
 assert.deepEqual(Object.keys(emblems),expected)
 const provenance=readFileSync(path.join(root,'public/game-assets/lol-ranks/README.md'),'utf8')
 for(const tier of expected){
  const bytes=readFileSync(path.join(root,`public/game-assets/lol-ranks/${tier}.png`)),meta=emblems[tier],b=meta.bounds
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a')
  assert.equal(bytes.readUInt32BE(16),meta.width);assert.equal(bytes.readUInt32BE(20),meta.height)
  assert.equal(meta.width,1000);assert.equal(meta.height,1000)
  assert.ok(provenance.includes(createHash('sha256').update(bytes).digest('hex').toUpperCase()),`${tier} provenance hash`)
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true})
  let left=info.width,top=info.height,right=-1,bottom=-1
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*info.channels+info.channels-1]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}
  assert.deepEqual(b,{left,top,width:right-left+1,height:bottom-top+1},`${tier}: alpha>0 minimal bounds`)
 }
})

test('transparent-canvas normalization preserves original proportions and centers the full nontransparent artwork',()=>{
 for(const tier of expected){
  const meta=emblems[tier],b=meta.bounds,style=ui.leagueEmblemStyle(tier)
  const width=parseFloat(style.width)/100,height=parseFloat(style.height)/100,left=parseFloat(style.left)/100,top=parseFloat(style.top)/100
  close(width/height,meta.width/meta.height,`${tier} original image ratio`)
  const x=left+b.left/meta.width*width,y=top+b.top/meta.height*height,w=b.width/meta.width*width,h=b.height/meta.height*height
  assert.ok(x>=0&&y>=0&&x+w<=1&&y+h<=1,`${tier} all alpha pixels inside square viewport`)
  close(x+w/2,.5,`${tier} horizontal center`);close(y+h/2,.5,`${tier} vertical center`)
  close(w/h,b.width/b.height,`${tier} artwork ratio`)
  assert.ok(Math.max(w,h)>=.9&&Math.max(w,h)<1,`${tier} useful normalized size and a nonzero safety margin`)
 }
})

test('map, inline, detail and choice CSS viewports retain every alpha pixel with contain fitting',()=>{
 const base=declarations('.badge .art'),image=declarations('.art .image')
 assert.equal(base.overflow,'hidden');assert.equal(image.position,'absolute');assert.equal(image['object-fit'],'contain');assert.equal(image['max-width'],'none')
 for(const size of ['map','inline','detail','choice']){
  const art={...base,...declarations(`.badge.${size} .art`)}
  for(const availableWidth of size==='choice'?[34,40,46]:[Infinity]){
   const {width:frameW,height:frameH}=resolveFrame(art,availableWidth)
   for(const tier of expected){
    const meta=emblems[tier],b=meta.bounds,style=ui.leagueEmblemStyle(tier)
    const boxW=frameW*parseFloat(style.width)/100,boxH=frameH*parseFloat(style.height)/100,scale=Math.min(boxW/meta.width,boxH/meta.height)
    const x=frameW*parseFloat(style.left)/100+(boxW-meta.width*scale)/2+b.left*scale,y=frameH*parseFloat(style.top)/100+(boxH-meta.height*scale)/2+b.top*scale
    assert.ok(x>=-1e-8&&y>=-1e-8&&x+b.width*scale<=frameW+1e-8&&y+b.height*scale<=frameH+1e-8,`${size}/${availableWidth}/${tier}: no nontransparent artwork is clipped`)
   }
  }
 }
})

test('choice artwork stays square when its available width shrinks to 34px or 40px',()=>{
 const art={...declarations('.badge .art'),...declarations('.badge.choice .art')}
 for(const availableWidth of [34,40,46,60]){
  const frame=resolveFrame(art,availableWidth)
  assert.equal(frame.width,Math.min(46,availableWidth),'max-width constrains the original 46px frame')
  assert.equal(frame.height,frame.width,`${availableWidth}px parent: auto height follows the square aspect ratio`)
 }
})
