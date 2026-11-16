import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapLabels} from '../src/plugins/shanhetu/map-labels.js';

class Sprite {
 constructor(){this._children=[];this.x=this.y=0;this.width=this.height=0;this.visible=true;this.graphics=new Proxy({}, {get:()=>()=>{}});}
 addChild(n){n.parent=this;this._children.push(n);return n;}
 removeSelf(){if(this.parent)this.parent._children=this.parent._children.filter(n=>n!==this);this.parent=null;}
 destroy(all){this.destroyed=true;if(all)for(const n of this._children)n.destroy(true);this.removeSelf();}
 pos(x,y){this.x=x;this.y=y;return this;}
 size(w,h){this.width=w;this.height=h;return this;}
 localToGlobal(p){const q={x:p.x+this.x,y:p.y+this.y};return this.parent?.localToGlobal(q)||q;}
 globalToLocal(p){const q=this.parent?.globalToLocal(p)||p;return {x:q.x-this.x,y:q.y-this.y};}
 getSelfBounds(){return {x:0,y:0,width:this.width,height:this.height};}
 getChildByName(name){return this._children.find(n=>n.name===name);}
}
class Text extends Sprite {get textWidth(){return (this.text||'').length*8;}get textHeight(){return 18;}}

test('returning to the same map keeps its last safe layout after temporary controls disappear',()=>{
 const stage=new Sprite().size(1200,850),scene=stage.addChild(new Sprite());scene.SceneName='RogueSmallMapScene';
 const cv=scene.cityView=scene.addChild(new Sprite());
 const city=cv.addChild(new Sprite().pos(500,350).size(100,80));city.HasEvent=true;
 city.cityImg={render:city,renderX:0,renderY:0,renderWidth:100,renderHeight:80};
 cv.GetCityItemById=()=>city;cv.cityItemDic=new Map([[1,city]]);
 const ctx={window:{Laya:{stage,Sprite,Text,Point:class{constructor(x,y){this.x=x;this.y=y;}}}},scope:{add:()=>()=>{}},ui:{nativeTheme:{watch:()=>()=>{}}}};
 const nodes=[{id:1,name:'关卡',type:'adventure',options:[{order:1,gain:'奖励'}]}],labels=createMapLabels(ctx);
 const position=()=>{const n=cv.getChildByName('sgs-toolbox-shanhe-labels')._children[0];return [n.x,n.y,n.width,n.height];};
 labels.update(scene,nodes,true);const first=position();
 scene.leftView=scene.addChild(new Sprite().pos(first[0],first[1]).size(first[2],first[3]));
 labels.update(scene,nodes,true);const saved=position();assert.notDeepEqual(saved,first,'a real control forces a different valid position');
 scene.SceneName='RogueBattleScene';labels.update(scene,[],true);
 assert.equal(cv.getChildByName('sgs-toolbox-shanhe-labels'),undefined);
 scene.leftView.destroy(true);scene.leftView=null;scene.SceneName='RogueSmallMapScene';
 labels.update(scene,nodes,true);assert.deepEqual(position(),saved,'return must restore the safe saved arrangement instead of the initial layout');
 // A transient empty snapshot during map entry must not overwrite the cache.
 labels.update(scene,[],true);labels.update(scene,nodes,true);assert.deepEqual(position(),saved);
 cv.visible=false;labels.update(scene,nodes,true);cv.visible=true;
 labels.update(scene,nodes,true);assert.deepEqual(position(),saved,'temporary hidden/invalid geometry during entry retains the layout');
 labels.clear();
});
