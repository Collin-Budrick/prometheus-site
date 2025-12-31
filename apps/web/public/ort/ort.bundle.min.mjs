/*!
 * ONNX Runtime Web v1.24.0-dev.20251227-38355ba07c
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
var Ln=Object.defineProperty;var mf=Object.getOwnPropertyDescriptor;var ff=Object.getOwnPropertyNames;var hf=Object.prototype.hasOwnProperty;var Wn=(t=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(t,{get:(e,r)=>(typeof require<"u"?require:e)[r]}):t)(function(t){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+t+'" is not supported')});var V=(t,e)=>()=>(t&&(e=t(t=0)),e);var Vt=(t,e)=>{for(var r in e)Ln(t,r,{get:e[r],enumerable:!0})},gf=(t,e,r,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let o of ff(e))!hf.call(t,o)&&o!==r&&Ln(t,o,{get:()=>e[o],enumerable:!(n=mf(e,o))||n.enumerable});return t};var Yt=t=>gf(Ln({},"__esModule",{value:!0}),t);var xr,Et,kt,bf,Oa,Gn=V(()=>{"use strict";xr=new Map,Et=[],kt=(t,e,r)=>{if(e&&typeof e.init=="function"&&typeof e.createInferenceSessionHandler=="function"){let n=xr.get(t);if(n===void 0)xr.set(t,{backend:e,priority:r});else{if(n.priority>r)return;if(n.priority===r&&n.backend!==e)throw new Error(`cannot register backend "${t}" using priority ${r}`)}if(r>=0){let o=Et.indexOf(t);o!==-1&&Et.splice(o,1);for(let i=0;i<Et.length;i++)if(xr.get(Et[i]).priority<=r){Et.splice(i,0,t);return}Et.push(t)}return}throw new TypeError("not a valid backend")},bf=async t=>{let e=xr.get(t);if(!e)return"backend not found.";if(e.initialized)return e.backend;if(e.aborted)return e.error;{let r=!!e.initPromise;try{return r||(e.initPromise=e.backend.init(t)),await e.initPromise,e.initialized=!0,e.backend}catch(n){return r||(e.error=`${n}`,e.aborted=!0),e.error}finally{delete e.initPromise}}},Oa=async t=>{let e=t.executionProviders||[],r=e.map(d=>typeof d=="string"?d:d.name),n=r.length===0?Et:r,o,i=[],s=new Set;for(let d of n){let c=await bf(d);typeof c=="string"?i.push({name:d,err:c}):(o||(o=c),o===c&&s.add(d))}if(!o)throw new Error(`no available backend found. ERR: ${i.map(d=>`[${d.name}] ${d.err}`).join(", ")}`);for(let{name:d,err:c}of i)r.includes(d)&&console.warn(`removing requested execution provider "${d}" from session options because it is not available: ${c}`);let u=e.filter(d=>s.has(typeof d=="string"?d:d.name));return[o,new Proxy(t,{get:(d,c)=>c==="executionProviders"?u:Reflect.get(d,c)})]}});var za=V(()=>{"use strict";Gn()});var Da,Ba=V(()=>{"use strict";Da="1.24.0-dev.20251116-b39e144322"});var Ma,ke,Hn=V(()=>{"use strict";Ba();Ma="warning",ke={wasm:{},webgl:{},webgpu:{},versions:{common:Da},set logLevel(t){if(t!==void 0){if(typeof t!="string"||["verbose","info","warning","error","fatal"].indexOf(t)===-1)throw new Error(`Unsupported logging level: ${t}`);Ma=t}},get logLevel(){return Ma}};Object.defineProperty(ke,"logLevel",{enumerable:!0})});var be,Ra=V(()=>{"use strict";Hn();be=ke});var Ua,Na,Va=V(()=>{"use strict";Ua=(t,e)=>{let r=typeof document<"u"?document.createElement("canvas"):new OffscreenCanvas(1,1);r.width=t.dims[3],r.height=t.dims[2];let n=r.getContext("2d");if(n!=null){let o,i;e?.tensorLayout!==void 0&&e.tensorLayout==="NHWC"?(o=t.dims[2],i=t.dims[3]):(o=t.dims[3],i=t.dims[2]);let s=e?.format!==void 0?e.format:"RGB",u=e?.norm,d,c;u===void 0||u.mean===void 0?d=[255,255,255,255]:typeof u.mean=="number"?d=[u.mean,u.mean,u.mean,u.mean]:(d=[u.mean[0],u.mean[1],u.mean[2],0],u.mean[3]!==void 0&&(d[3]=u.mean[3])),u===void 0||u.bias===void 0?c=[0,0,0,0]:typeof u.bias=="number"?c=[u.bias,u.bias,u.bias,u.bias]:(c=[u.bias[0],u.bias[1],u.bias[2],0],u.bias[3]!==void 0&&(c[3]=u.bias[3]));let p=i*o,m=0,g=p,y=p*2,b=-1;s==="RGBA"?(m=0,g=p,y=p*2,b=p*3):s==="RGB"?(m=0,g=p,y=p*2):s==="RBG"&&(m=0,y=p,g=p*2);for(let w=0;w<i;w++)for(let S=0;S<o;S++){let x=(t.data[m++]-c[0])*d[0],$=(t.data[g++]-c[1])*d[1],T=(t.data[y++]-c[2])*d[2],I=b===-1?255:(t.data[b++]-c[3])*d[3];n.fillStyle="rgba("+x+","+$+","+T+","+I+")",n.fillRect(S,w,1,1)}if("toDataURL"in r)return r.toDataURL();throw new Error("toDataURL is not supported")}else throw new Error("Can not access image data")},Na=(t,e)=>{let r=typeof document<"u"?document.createElement("canvas").getContext("2d"):new OffscreenCanvas(1,1).getContext("2d"),n;if(r!=null){let o,i,s;e?.tensorLayout!==void 0&&e.tensorLayout==="NHWC"?(o=t.dims[2],i=t.dims[1],s=t.dims[3]):(o=t.dims[3],i=t.dims[2],s=t.dims[1]);let u=e!==void 0&&e.format!==void 0?e.format:"RGB",d=e?.norm,c,p;d===void 0||d.mean===void 0?c=[255,255,255,255]:typeof d.mean=="number"?c=[d.mean,d.mean,d.mean,d.mean]:(c=[d.mean[0],d.mean[1],d.mean[2],255],d.mean[3]!==void 0&&(c[3]=d.mean[3])),d===void 0||d.bias===void 0?p=[0,0,0,0]:typeof d.bias=="number"?p=[d.bias,d.bias,d.bias,d.bias]:(p=[d.bias[0],d.bias[1],d.bias[2],0],d.bias[3]!==void 0&&(p[3]=d.bias[3]));let m=i*o;if(e!==void 0&&(e.format!==void 0&&s===4&&e.format!=="RGBA"||s===3&&e.format!=="RGB"&&e.format!=="BGR"))throw new Error("Tensor format doesn't match input tensor dims");let g=4,y=0,b=1,w=2,S=3,x=0,$=m,T=m*2,I=-1;u==="RGBA"?(x=0,$=m,T=m*2,I=m*3):u==="RGB"?(x=0,$=m,T=m*2):u==="RBG"&&(x=0,T=m,$=m*2),n=r.createImageData(o,i);for(let E=0;E<i*o;y+=g,b+=g,w+=g,S+=g,E++)n.data[y]=(t.data[x++]-p[0])*c[0],n.data[b]=(t.data[$++]-p[1])*c[1],n.data[w]=(t.data[T++]-p[2])*c[2],n.data[S]=I===-1?255:(t.data[I++]-p[3])*c[3]}else throw new Error("Can not access image data");return n}});var Fn,La,Wa,Ga,Ha,Fa,qa=V(()=>{"use strict";Sr();Fn=(t,e)=>{if(t===void 0)throw new Error("Image buffer must be defined");if(e.height===void 0||e.width===void 0)throw new Error("Image height and width must be defined");if(e.tensorLayout==="NHWC")throw new Error("NHWC Tensor layout is not supported yet");let{height:r,width:n}=e,o=e.norm??{mean:255,bias:0},i,s;typeof o.mean=="number"?i=[o.mean,o.mean,o.mean,o.mean]:i=[o.mean[0],o.mean[1],o.mean[2],o.mean[3]??255],typeof o.bias=="number"?s=[o.bias,o.bias,o.bias,o.bias]:s=[o.bias[0],o.bias[1],o.bias[2],o.bias[3]??0];let u=e.format!==void 0?e.format:"RGBA",d=e.tensorFormat!==void 0&&e.tensorFormat!==void 0?e.tensorFormat:"RGB",c=r*n,p=d==="RGBA"?new Float32Array(c*4):new Float32Array(c*3),m=4,g=0,y=1,b=2,w=3,S=0,x=c,$=c*2,T=-1;u==="RGB"&&(m=3,g=0,y=1,b=2,w=-1),d==="RGBA"?T=c*3:d==="RBG"?(S=0,$=c,x=c*2):d==="BGR"&&($=0,x=c,S=c*2);for(let E=0;E<c;E++,g+=m,b+=m,y+=m,w+=m)p[S++]=(t[g]+s[0])/i[0],p[x++]=(t[y]+s[1])/i[1],p[$++]=(t[b]+s[2])/i[2],T!==-1&&w!==-1&&(p[T++]=(t[w]+s[3])/i[3]);return d==="RGBA"?new De("float32",p,[1,4,r,n]):new De("float32",p,[1,3,r,n])},La=async(t,e)=>{let r=typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement,n=typeof ImageData<"u"&&t instanceof ImageData,o=typeof ImageBitmap<"u"&&t instanceof ImageBitmap,i=typeof t=="string",s,u=e??{},d=()=>{if(typeof document<"u")return document.createElement("canvas");if(typeof OffscreenCanvas<"u")return new OffscreenCanvas(1,1);throw new Error("Canvas is not supported")},c=p=>typeof HTMLCanvasElement<"u"&&p instanceof HTMLCanvasElement||p instanceof OffscreenCanvas?p.getContext("2d"):null;if(r){let p=d();p.width=t.width,p.height=t.height;let m=c(p);if(m!=null){let g=t.height,y=t.width;if(e!==void 0&&e.resizedHeight!==void 0&&e.resizedWidth!==void 0&&(g=e.resizedHeight,y=e.resizedWidth),e!==void 0){if(u=e,e.tensorFormat!==void 0)throw new Error("Image input config format must be RGBA for HTMLImageElement");u.tensorFormat="RGBA",u.height=g,u.width=y}else u.tensorFormat="RGBA",u.height=g,u.width=y;m.drawImage(t,0,0),s=m.getImageData(0,0,y,g).data}else throw new Error("Can not access image data")}else if(n){let p,m;if(e!==void 0&&e.resizedWidth!==void 0&&e.resizedHeight!==void 0?(p=e.resizedHeight,m=e.resizedWidth):(p=t.height,m=t.width),e!==void 0&&(u=e),u.format="RGBA",u.height=p,u.width=m,e!==void 0){let g=d();g.width=m,g.height=p;let y=c(g);if(y!=null)y.putImageData(t,0,0),s=y.getImageData(0,0,m,p).data;else throw new Error("Can not access image data")}else s=t.data}else if(o){if(e===void 0)throw new Error("Please provide image config with format for Imagebitmap");let p=d();p.width=t.width,p.height=t.height;let m=c(p);if(m!=null){let g=t.height,y=t.width;return m.drawImage(t,0,0,y,g),s=m.getImageData(0,0,y,g).data,u.height=g,u.width=y,Fn(s,u)}else throw new Error("Can not access image data")}else{if(i)return new Promise((p,m)=>{let g=d(),y=c(g);if(!t||!y)return m();let b=new Image;b.crossOrigin="Anonymous",b.src=t,b.onload=()=>{g.width=b.width,g.height=b.height,y.drawImage(b,0,0,g.width,g.height);let w=y.getImageData(0,0,g.width,g.height);u.height=g.height,u.width=g.width,p(Fn(w.data,u))}});throw new Error("Input data provided is not supported - aborted tensor creation")}if(s!==void 0)return Fn(s,u);throw new Error("Input data provided is not supported - aborted tensor creation")},Wa=(t,e)=>{let{width:r,height:n,download:o,dispose:i}=e,s=[1,n,r,4];return new De({location:"texture",type:"float32",texture:t,dims:s,download:o,dispose:i})},Ga=(t,e)=>{let{dataType:r,dims:n,download:o,dispose:i}=e;return new De({location:"gpu-buffer",type:r??"float32",gpuBuffer:t,dims:n,download:o,dispose:i})},Ha=(t,e)=>{let{dataType:r,dims:n,download:o,dispose:i}=e;return new De({location:"ml-tensor",type:r??"float32",mlTensor:t,dims:n,download:o,dispose:i})},Fa=(t,e,r)=>new De({location:"cpu-pinned",type:t,data:e,dims:r??[e.length]})});var Pt,Xt,Ka,ja,Za=V(()=>{"use strict";Pt=new Map([["float32",Float32Array],["uint8",Uint8Array],["int8",Int8Array],["uint16",Uint16Array],["int16",Int16Array],["int32",Int32Array],["bool",Uint8Array],["float64",Float64Array],["uint32",Uint32Array],["int4",Uint8Array],["uint4",Uint8Array]]),Xt=new Map([[Float32Array,"float32"],[Uint8Array,"uint8"],[Int8Array,"int8"],[Uint16Array,"uint16"],[Int16Array,"int16"],[Int32Array,"int32"],[Float64Array,"float64"],[Uint32Array,"uint32"]]),Ka=!1,ja=()=>{if(!Ka){Ka=!0;let t=typeof BigInt64Array<"u"&&BigInt64Array.from,e=typeof BigUint64Array<"u"&&BigUint64Array.from,r=globalThis.Float16Array,n=typeof r<"u"&&r.from;t&&(Pt.set("int64",BigInt64Array),Xt.set(BigInt64Array,"int64")),e&&(Pt.set("uint64",BigUint64Array),Xt.set(BigUint64Array,"uint64")),n?(Pt.set("float16",r),Xt.set(r,"float16")):Pt.set("float16",Uint16Array)}}});var Qa,Ya,Xa=V(()=>{"use strict";Sr();Qa=t=>{let e=1;for(let r=0;r<t.length;r++){let n=t[r];if(typeof n!="number"||!Number.isSafeInteger(n))throw new TypeError(`dims[${r}] must be an integer, got: ${n}`);if(n<0)throw new RangeError(`dims[${r}] must be a non-negative integer, got: ${n}`);e*=n}return e},Ya=(t,e)=>{switch(t.location){case"cpu":return new De(t.type,t.data,e);case"cpu-pinned":return new De({location:"cpu-pinned",data:t.data,type:t.type,dims:e});case"texture":return new De({location:"texture",texture:t.texture,type:t.type,dims:e});case"gpu-buffer":return new De({location:"gpu-buffer",gpuBuffer:t.gpuBuffer,type:t.type,dims:e});case"ml-tensor":return new De({location:"ml-tensor",mlTensor:t.mlTensor,type:t.type,dims:e});default:throw new Error(`tensorReshape: tensor location ${t.location} is not supported`)}}});var De,Sr=V(()=>{"use strict";Va();qa();Za();Xa();De=class{constructor(e,r,n){ja();let o,i;if(typeof e=="object"&&"location"in e)switch(this.dataLocation=e.location,o=e.type,i=e.dims,e.location){case"cpu-pinned":{let u=Pt.get(o);if(!u)throw new TypeError(`unsupported type "${o}" to create tensor from pinned buffer`);if(!(e.data instanceof u))throw new TypeError(`buffer should be of type ${u.name}`);this.cpuData=e.data;break}case"texture":{if(o!=="float32")throw new TypeError(`unsupported type "${o}" to create tensor from texture`);this.gpuTextureData=e.texture,this.downloader=e.download,this.disposer=e.dispose;break}case"gpu-buffer":{if(o!=="float32"&&o!=="float16"&&o!=="int32"&&o!=="int64"&&o!=="uint32"&&o!=="uint8"&&o!=="bool"&&o!=="uint4"&&o!=="int4")throw new TypeError(`unsupported type "${o}" to create tensor from gpu buffer`);this.gpuBufferData=e.gpuBuffer,this.downloader=e.download,this.disposer=e.dispose;break}case"ml-tensor":{if(o!=="float32"&&o!=="float16"&&o!=="int32"&&o!=="int64"&&o!=="uint32"&&o!=="uint64"&&o!=="int8"&&o!=="uint8"&&o!=="bool"&&o!=="uint4"&&o!=="int4")throw new TypeError(`unsupported type "${o}" to create tensor from MLTensor`);this.mlTensorData=e.mlTensor,this.downloader=e.download,this.disposer=e.dispose;break}default:throw new Error(`Tensor constructor: unsupported location '${this.dataLocation}'`)}else{let u,d;if(typeof e=="string")if(o=e,d=n,e==="string"){if(!Array.isArray(r))throw new TypeError("A string tensor's data must be a string array.");u=r}else{let c=Pt.get(e);if(c===void 0)throw new TypeError(`Unsupported tensor type: ${e}.`);if(Array.isArray(r)){if(e==="float16"&&c===Uint16Array||e==="uint4"||e==="int4")throw new TypeError(`Creating a ${e} tensor from number array is not supported. Please use ${c.name} as data.`);e==="uint64"||e==="int64"?u=c.from(r,BigInt):u=c.from(r)}else if(r instanceof c)u=r;else if(r instanceof Uint8ClampedArray)if(e==="uint8")u=Uint8Array.from(r);else throw new TypeError("A Uint8ClampedArray tensor's data must be type of uint8");else if(e==="float16"&&r instanceof Uint16Array&&c!==Uint16Array)u=new globalThis.Float16Array(r.buffer,r.byteOffset,r.length);else throw new TypeError(`A ${o} tensor's data must be type of ${c}`)}else if(d=r,Array.isArray(e)){if(e.length===0)throw new TypeError("Tensor type cannot be inferred from an empty array.");let c=typeof e[0];if(c==="string")o="string",u=e;else if(c==="boolean")o="bool",u=Uint8Array.from(e);else throw new TypeError(`Invalid element type of data array: ${c}.`)}else if(e instanceof Uint8ClampedArray)o="uint8",u=Uint8Array.from(e);else{let c=Xt.get(e.constructor);if(c===void 0)throw new TypeError(`Unsupported type for tensor data: ${e.constructor}.`);o=c,u=e}if(d===void 0)d=[u.length];else if(!Array.isArray(d))throw new TypeError("A tensor's dims must be a number array");i=d,this.cpuData=u,this.dataLocation="cpu"}let s=Qa(i);if(this.cpuData&&s!==this.cpuData.length&&!((o==="uint4"||o==="int4")&&Math.ceil(s/2)===this.cpuData.length))throw new Error(`Tensor's size(${s}) does not match data length(${this.cpuData.length}).`);this.type=o,this.dims=i,this.size=s}static async fromImage(e,r){return La(e,r)}static fromTexture(e,r){return Wa(e,r)}static fromGpuBuffer(e,r){return Ga(e,r)}static fromMLTensor(e,r){return Ha(e,r)}static fromPinnedBuffer(e,r,n){return Fa(e,r,n)}toDataURL(e){return Ua(this,e)}toImageData(e){return Na(this,e)}get data(){if(this.ensureValid(),!this.cpuData)throw new Error("The data is not on CPU. Use `getData()` to download GPU data to CPU, or use `texture` or `gpuBuffer` property to access the GPU data directly.");return this.cpuData}get location(){return this.dataLocation}get texture(){if(this.ensureValid(),!this.gpuTextureData)throw new Error("The data is not stored as a WebGL texture.");return this.gpuTextureData}get gpuBuffer(){if(this.ensureValid(),!this.gpuBufferData)throw new Error("The data is not stored as a WebGPU buffer.");return this.gpuBufferData}get mlTensor(){if(this.ensureValid(),!this.mlTensorData)throw new Error("The data is not stored as a WebNN MLTensor.");return this.mlTensorData}async getData(e){switch(this.ensureValid(),this.dataLocation){case"cpu":case"cpu-pinned":return this.data;case"texture":case"gpu-buffer":case"ml-tensor":{if(!this.downloader)throw new Error("The current tensor is not created with a specified data downloader.");if(this.isDownloading)throw new Error("The current tensor is being downloaded.");try{this.isDownloading=!0;let r=await this.downloader();return this.downloader=void 0,this.dataLocation="cpu",this.cpuData=r,e&&this.disposer&&(this.disposer(),this.disposer=void 0),r}finally{this.isDownloading=!1}}default:throw new Error(`cannot get data from location: ${this.dataLocation}`)}}dispose(){if(this.isDownloading)throw new Error("The current tensor is being downloaded.");this.disposer&&(this.disposer(),this.disposer=void 0),this.cpuData=void 0,this.gpuTextureData=void 0,this.gpuBufferData=void 0,this.mlTensorData=void 0,this.downloader=void 0,this.isDownloading=void 0,this.dataLocation="none"}ensureValid(){if(this.dataLocation==="none")throw new Error("The tensor is disposed.")}reshape(e){if(this.ensureValid(),this.downloader||this.disposer)throw new Error("Cannot reshape a tensor that owns GPU resource.");return Ya(this,e)}}});var Ke,qn=V(()=>{"use strict";Sr();Ke=De});var Tr,Ja,Ne,Me,wt,_t,Kn=V(()=>{"use strict";Hn();Tr=(t,e)=>{(typeof ke.trace>"u"?!ke.wasm.trace:!ke.trace)||console.timeStamp(`${t}::ORT::${e}`)},Ja=(t,e)=>{let r=new Error().stack?.split(/\r\n|\r|\n/g)||[],n=!1;for(let o=0;o<r.length;o++){if(n&&!r[o].includes("TRACE_FUNC")){let i=`FUNC_${t}::${r[o].trim().split(" ")[1]}`;e&&(i+=`::${e}`),Tr("CPU",i);return}r[o].includes("TRACE_FUNC")&&(n=!0)}},Ne=t=>{(typeof ke.trace>"u"?!ke.wasm.trace:!ke.trace)||Ja("BEGIN",t)},Me=t=>{(typeof ke.trace>"u"?!ke.wasm.trace:!ke.trace)||Ja("END",t)},wt=t=>{(typeof ke.trace>"u"?!ke.wasm.trace:!ke.trace)||console.time(`ORT::${t}`)},_t=t=>{(typeof ke.trace>"u"?!ke.wasm.trace:!ke.trace)||console.timeEnd(`ORT::${t}`)}});var Ir,es=V(()=>{"use strict";Gn();qn();Kn();Ir=class t{constructor(e){this.handler=e}async run(e,r,n){Ne(),wt("InferenceSession.run");let o={},i={};if(typeof e!="object"||e===null||e instanceof Ke||Array.isArray(e))throw new TypeError("'feeds' must be an object that use input names as keys and OnnxValue as corresponding values.");let s=!0;if(typeof r=="object"){if(r===null)throw new TypeError("Unexpected argument[1]: cannot be null.");if(r instanceof Ke)throw new TypeError("'fetches' cannot be a Tensor");if(Array.isArray(r)){if(r.length===0)throw new TypeError("'fetches' cannot be an empty array.");s=!1;for(let c of r){if(typeof c!="string")throw new TypeError("'fetches' must be a string array or an object.");if(this.outputNames.indexOf(c)===-1)throw new RangeError(`'fetches' contains invalid output name: ${c}.`);o[c]=null}if(typeof n=="object"&&n!==null)i=n;else if(typeof n<"u")throw new TypeError("'options' must be an object.")}else{let c=!1,p=Object.getOwnPropertyNames(r);for(let m of this.outputNames)if(p.indexOf(m)!==-1){let g=r[m];(g===null||g instanceof Ke)&&(c=!0,s=!1,o[m]=g)}if(c){if(typeof n=="object"&&n!==null)i=n;else if(typeof n<"u")throw new TypeError("'options' must be an object.")}else i=r}}else if(typeof r<"u")throw new TypeError("Unexpected argument[1]: must be 'fetches' or 'options'.");for(let c of this.inputNames)if(typeof e[c]>"u")throw new Error(`input '${c}' is missing in 'feeds'.`);if(s)for(let c of this.outputNames)o[c]=null;let u=await this.handler.run(e,o,i),d={};for(let c in u)if(Object.hasOwnProperty.call(u,c)){let p=u[c];p instanceof Ke?d[c]=p:d[c]=new Ke(p.type,p.data,p.dims)}return _t("InferenceSession.run"),Me(),d}async release(){return this.handler.dispose()}static async create(e,r,n,o){Ne(),wt("InferenceSession.create");let i,s={};if(typeof e=="string"){if(i=e,typeof r=="object"&&r!==null)s=r;else if(typeof r<"u")throw new TypeError("'options' must be an object.")}else if(e instanceof Uint8Array){if(i=e,typeof r=="object"&&r!==null)s=r;else if(typeof r<"u")throw new TypeError("'options' must be an object.")}else if(e instanceof ArrayBuffer||typeof SharedArrayBuffer<"u"&&e instanceof SharedArrayBuffer){let p=e,m=0,g=e.byteLength;if(typeof r=="object"&&r!==null)s=r;else if(typeof r=="number"){if(m=r,!Number.isSafeInteger(m))throw new RangeError("'byteOffset' must be an integer.");if(m<0||m>=p.byteLength)throw new RangeError(`'byteOffset' is out of range [0, ${p.byteLength}).`);if(g=e.byteLength-m,typeof n=="number"){if(g=n,!Number.isSafeInteger(g))throw new RangeError("'byteLength' must be an integer.");if(g<=0||m+g>p.byteLength)throw new RangeError(`'byteLength' is out of range (0, ${p.byteLength-m}].`);if(typeof o=="object"&&o!==null)s=o;else if(typeof o<"u")throw new TypeError("'options' must be an object.")}else if(typeof n<"u")throw new TypeError("'byteLength' must be a number.")}else if(typeof r<"u")throw new TypeError("'options' must be an object.");i=new Uint8Array(p,m,g)}else throw new TypeError("Unexpected argument[0]: must be 'path' or 'buffer'.");let[u,d]=await Oa(s),c=await u.createInferenceSessionHandler(i,d);return _t("InferenceSession.create"),Me(),new t(c)}startProfiling(){this.handler.startProfiling()}endProfiling(){this.handler.endProfiling()}get inputNames(){return this.handler.inputNames}get outputNames(){return this.handler.outputNames}get inputMetadata(){return this.handler.inputMetadata}get outputMetadata(){return this.handler.outputMetadata}}});var yf,ts=V(()=>{"use strict";es();yf=Ir});var rs=V(()=>{"use strict"});var ns=V(()=>{"use strict"});var os=V(()=>{"use strict"});var is=V(()=>{"use strict"});var jn={};Vt(jn,{InferenceSession:()=>yf,TRACE:()=>Tr,TRACE_EVENT_BEGIN:()=>wt,TRACE_EVENT_END:()=>_t,TRACE_FUNC_BEGIN:()=>Ne,TRACE_FUNC_END:()=>Me,Tensor:()=>Ke,env:()=>be,registerBackend:()=>kt});var Ve=V(()=>{"use strict";za();Ra();ts();qn();rs();ns();Kn();os();is()});var Cr=V(()=>{"use strict"});var ds={};Vt(ds,{default:()=>wf});var ss,us,wf,ls=V(()=>{"use strict";Zn();vt();Ar();ss="ort-wasm-proxy-worker",us=globalThis.self?.name===ss;us&&(self.onmessage=t=>{let{type:e,in:r}=t.data;try{switch(e){case"init-wasm":Er(r.wasm).then(()=>{kr(r).then(()=>{postMessage({type:e})},n=>{postMessage({type:e,err:n})})},n=>{postMessage({type:e,err:n})});break;case"init-ep":{let{epName:n,env:o}=r;Pr(o,n).then(()=>{postMessage({type:e})},i=>{postMessage({type:e,err:i})});break}case"copy-from":{let{buffer:n}=r,o=Jt(n);postMessage({type:e,out:o});break}case"create":{let{model:n,options:o}=r;Or(n,o).then(i=>{postMessage({type:e,out:i})},i=>{postMessage({type:e,err:i})});break}case"release":zr(r),postMessage({type:e});break;case"run":{let{sessionId:n,inputIndices:o,inputs:i,outputIndices:s,options:u}=r;Dr(n,o,i,s,new Array(s.length).fill(null),u).then(d=>{d.some(c=>c[3]!=="cpu")?postMessage({type:e,err:"Proxy does not support non-cpu tensor location."}):postMessage({type:e,out:d},Mr([...i,...d]))},d=>{postMessage({type:e,err:d})});break}case"end-profiling":Br(r),postMessage({type:e});break;default:}}catch(n){postMessage({type:e,err:n})}});wf=us?null:t=>new Worker(t??Le,{type:"module",name:ss})});var ps={};Vt(ps,{default:()=>_f});async function cs(t={}){var e=t,r=!!globalThis.window,n=!!globalThis.WorkerGlobalScope,o=n&&self.name?.startsWith("em-pthread");e.mountExternalData=(a,l)=>{a.startsWith("./")&&(a=a.substring(2)),(e.Wc||(e.Wc=new Map)).set(a,l)},e.unmountExternalData=()=>{delete e.Wc},globalThis.SharedArrayBuffer??new WebAssembly.Memory({initial:0,maximum:0,Xd:!0}).buffer.constructor;let i=a=>async(...l)=>{try{if(e.Xc)throw Error("Session already started");let h=e.Xc={Jd:l[0],errors:[]},f=await a(...l);if(e.Xc!==h)throw Error("Session mismatch");e.bd?.flush();let _=h.errors;if(0<_.length){let C=await Promise.all(_);if(C=C.filter(P=>P),0<C.length)throw Error(C.join(`
`))}return f}finally{e.Xc=null}};e.jsepInit=(a,l)=>{if(a==="webgpu"){[e.bd,e.zd,e.Dd,e.cd,e.Cd,e.$b,e.Ed,e.Gd,e.Ad,e.Bd,e.Fd]=l;let h=e.bd;e.jsepRegisterBuffer=(f,_,C,P)=>h.registerBuffer(f,_,C,P),e.jsepGetBuffer=f=>h.getBuffer(f),e.jsepCreateDownloader=(f,_,C)=>h.createDownloader(f,_,C),e.jsepOnCreateSession=f=>{h.onCreateSession(f)},e.jsepOnReleaseSession=f=>{h.onReleaseSession(f)},e.jsepOnRunStart=f=>h.onRunStart(f),e.Hd=(f,_)=>{h.upload(f,_)}}else if(a==="webnn"){let h=l[0];[e.Vd,e.rd,e.webnnEnsureTensor,e.sd,e.webnnDownloadTensor,e.Ud,e.webnnEnableTraceEvent]=l.slice(1),e.webnnReleaseTensorId=e.rd,e.webnnUploadTensor=e.sd,e.webnnRegisterMLContext=e.Ud,e.webnnOnRunStart=f=>h.onRunStart(f),e.webnnOnRunEnd=h.onRunEnd.bind(h),e.webnnOnReleaseSession=f=>{h.onReleaseSession(f)},e.webnnCreateMLTensorDownloader=(f,_)=>h.createMLTensorDownloader(f,_),e.webnnRegisterMLTensor=(f,_,C,P)=>h.registerMLTensor(f,_,C,P),e.webnnCreateMLContext=f=>h.createMLContext(f),e.webnnRegisterMLConstant=(f,_,C,P,B,G)=>h.registerMLConstant(f,_,C,P,B,e.Wc,G),e.webnnRegisterGraphInput=h.registerGraphInput.bind(h),e.webnnIsGraphInput=h.isGraphInput.bind(h),e.webnnRegisterGraphOutput=h.registerGraphOutput.bind(h),e.webnnIsGraphOutput=h.isGraphOutput.bind(h),e.webnnCreateTemporaryTensor=h.createTemporaryTensor.bind(h),e.webnnIsGraphInputOutputTypeSupported=h.isGraphInputOutputTypeSupported.bind(h)}};let s=()=>{let a=l=>(...h)=>{let f=et;return h=l(...h),et!=f?new Promise((_,C)=>{En={resolve:_,reject:C}}):h};(()=>{for(let l of["_OrtAppendExecutionProvider","_OrtCreateSession","_OrtRun","_OrtRunWithBinding","_OrtBindInput"])e[l]=a(e[l])})(),i!==void 0&&(e._OrtRun=i(e._OrtRun),e._OrtRunWithBinding=i(e._OrtRunWithBinding)),s=void 0};e.asyncInit=()=>{s?.()};var u,d,c=(a,l)=>{throw l},p=import.meta.url,m="";if(r||n){try{m=new URL(".",p).href}catch{}n&&(d=a=>{var l=new XMLHttpRequest;return l.open("GET",a,!1),l.responseType="arraybuffer",l.send(null),new Uint8Array(l.response)}),u=async a=>{if(z(a))return new Promise((h,f)=>{var _=new XMLHttpRequest;_.open("GET",a,!0),_.responseType="arraybuffer",_.onload=()=>{_.status==200||_.status==0&&_.response?h(_.response):f(_.status)},_.onerror=f,_.send(null)});var l=await fetch(a,{credentials:"same-origin"});if(l.ok)return l.arrayBuffer();throw Error(l.status+" : "+l.url)}}var g,y,b,w,S,x,$=console.log.bind(console),T=console.error.bind(console),I=$,E=T,A=!1,z=a=>a.startsWith("file://");function v(){ht.buffer!=N.buffer&&Te()}if(o){let a=function(l){try{var h=l.data,f=h.Rc;if(f==="load"){let _=[];self.onmessage=C=>_.push(C),x=()=>{postMessage({Rc:"loaded"});for(let C of _)a(C);self.onmessage=a};for(let C of h.wd)e[C]&&!e[C].proxy||(e[C]=(...P)=>{postMessage({Rc:"callHandler",vd:C,args:P})},C=="print"&&(I=e[C]),C=="printErr"&&(E=e[C]));ht=h.Nd,Te(),y=h.Od,Se(),$r()}else if(f==="run"){(function(_){var C=(v(),W)[_+52>>>2>>>0];_=(v(),W)[_+56>>>2>>>0],Li(C,C-_),de(C)})(h.Qc),Dn(h.Qc,0,0,1,0,0),Wo(),Cn(h.Qc),M||(Bi(),M=!0);try{np(h.Ld,h.Zc)}catch(_){if(_!="unwind")throw _}}else h.target!=="setimmediate"&&(f==="checkMailbox"?M&&fr():f&&(E(`worker: received unknown command ${f}`),E(h)))}catch(_){throw Mi(),_}};var jb=a,M=!1;self.onunhandledrejection=l=>{throw l.reason||l},self.onmessage=a}var N,K,q,Q,D,W,j,Y,Z,te,ie,we=!1;function Te(){var a=ht.buffer;e.HEAP8=N=new Int8Array(a),q=new Int16Array(a),e.HEAPU8=K=new Uint8Array(a),Q=new Uint16Array(a),e.HEAP32=D=new Int32Array(a),e.HEAPU32=W=new Uint32Array(a),j=new Float32Array(a),Y=new Float64Array(a),Z=new BigInt64Array(a),te=new BigUint64Array(a)}function re(){we=!0,o?x():ct.sb()}function U(a){throw E(a="Aborted("+a+")"),A=!0,a=new WebAssembly.RuntimeError(a+". Build with -sASSERTIONS for more info."),S?.(a),a}function X(){return{a:{la:Cm,fb:Im,g:op,J:ip,f:ap,o:sp,i:up,ga:dp,b:lp,S:cp,Ga:Yo,n:pp,Z:Xo,Wa:Jo,Ca:ei,Ea:ti,Xa:ri,Ua:ni,Na:oi,Ta:ii,ja:ai,Da:si,Aa:ui,Va:di,Ba:li,ab:mp,da:hp,va:gp,ta:yp,ca:_p,O:vp,H:$p,ua:xp,Y:kp,wa:Pp,Qa:Op,ya:Dp,Ha:Bp,ra:Mp,ea:Rp,Pa:Cn,Za:Up,Q:Wp,r:Kp,c:Tn,gb:jp,y:Zp,M:Qp,C:Yp,m:Xp,s:yi,hb:yi,I:Jp,R:em,j:tm,v:rm,q:nm,l:om,Ka:im,La:am,Ma:sm,Ia:$i,Ja:xi,sa:Si,cb:dm,$a:pm,u:mm,$:fm,fa:hm,_a:lm,U:gm,Ya:bm,za:ym,F:um,T:wm,ka:_r,xa:vm,eb:_m,db:$m,Ra:Ai,Sa:Ei,Fa:_n,_:ki,ia:Pi,Oa:Oi,ha:zi,jb:lf,ma:rf,kb:df,na:tf,G:Km,d:Pm,t:Em,w:Am,A:Lm,ob:Ym,K:Hm,x:zm,oa:Jm,W:nf,aa:Qm,lb:uf,mb:sf,nb:Xm,pa:Zm,pb:jm,N:Fm,X:ef,e:Om,B:Dm,k:km,ib:cf,p:Bm,z:Mm,D:Vm,E:Rm,L:Wm,qb:qm,P:of,ba:Gm,V:af,rb:Nm,qa:Um,h:Sm,a:ht,bb:dr}}}async function Se(){function a(f,_){var C=ct=f.exports;f={};for(let[P,B]of Object.entries(C))typeof B=="function"?(C=Np(B),f[P]=C):f[P]=B;return ct=f,ct=function(){var P=ct,B=H=>ue=>H(ue)>>>0,G=H=>()=>H()>>>0;return(P=Object.assign({},P)).tb=B(P.tb),P.Xb=G(P.Xb),P.Zb=B(P.Zb),P.lc=B(P.lc),P.mc=G(P.mc),P.qc=B(P.qc),P}(),Vo.push(ct._b),Di=(f=ct).tb,Bi=f.ub,e._OrtInit=f.vb,e._OrtGetLastError=f.wb,e._OrtCreateSessionOptions=f.xb,e._OrtAppendExecutionProvider=f.yb,e._OrtAddFreeDimensionOverride=f.zb,e._OrtAddSessionConfigEntry=f.Ab,e._OrtReleaseSessionOptions=f.Bb,e._OrtCreateSession=f.Cb,e._OrtReleaseSession=f.Db,e._OrtGetInputOutputCount=f.Eb,e._OrtGetInputOutputMetadata=f.Fb,e._OrtFree=f.Gb,e._OrtCreateTensor=f.Hb,e._OrtGetTensorData=f.Ib,e._OrtReleaseTensor=f.Jb,e._OrtCreateRunOptions=f.Kb,e._OrtAddRunConfigEntry=f.Lb,e._OrtReleaseRunOptions=f.Mb,e._OrtCreateBinding=f.Nb,e._OrtBindInput=f.Ob,e._OrtBindOutput=f.Pb,e._OrtClearBoundOutputs=f.Qb,e._OrtReleaseBinding=f.Rb,e._OrtRunWithBinding=f.Sb,e._OrtRun=f.Tb,e._OrtEndProfiling=f.Ub,e._JsepOutput=f.Vb,e._JsepGetNodeName=f.Wb,vr=f.Xb,tt=e._free=f.Yb,Zt=e._malloc=f.Zb,Dn=f.ac,Mi=f.bc,Ri=f.cc,Ui=f.dc,Bn=f.ec,Ni=f.fc,Vi=f.gc,ce=f.hc,Qt=f.ic,Li=f.jc,de=f.kc,Mn=f.lc,le=f.mc,Wi=f.nc,Gi=f.oc,Hi=f.pc,Fi=f.qc,qi=f.rc,Rn=f.sc,Ki=f.tc,ji=f.uc,Zi=f.vc,Qi=f.wc,Yi=f.xc,Xi=f.yc,Ji=f.zc,ea=f.Ac,ta=f.Bc,ra=f.Cc,na=f.Dc,oa=f.Ec,ia=f.Fc,aa=f.Gc,sa=f.Hc,ua=f.Ic,da=f.Jc,la=f.Kc,ca=f.Lc,pa=f.Mc,ma=f.Oc,fa=f.Pc,ha=f._c,ga=f.$c,ba=f.ed,ya=f.hd,wa=f.id,_a=f.jd,va=f.kd,$a=f.ld,xa=f.md,Sa=f.nd,Ta=f.od,Ia=f.pd,Ca=f.ud,Aa=f.Qd,Ea=f.Rd,ka=f.Sd,Pa=f.Td,y=_,ct}var l,h=X();return e.instantiateWasm?new Promise(f=>{e.instantiateWasm(h,(_,C)=>{f(a(_,C))})}):o?a(new WebAssembly.Instance(y,X()),y):(ie??=e.locateFile?e.locateFile?e.locateFile("ort-wasm-simd-threaded.jsep.wasm",m):m+"ort-wasm-simd-threaded.jsep.wasm":new URL("ort-wasm-simd-threaded.jsep.wasm",import.meta.url).href,l=await async function(f){var _=ie;if(!g&&!z(_))try{var C=fetch(_,{credentials:"same-origin"});return await WebAssembly.instantiateStreaming(C,f)}catch(P){E(`wasm streaming compile failed: ${P}`),E("falling back to ArrayBuffer instantiation")}return async function(P,B){try{var G=await async function(H){if(!g)try{var ue=await u(H);return new Uint8Array(ue)}catch{}if(H==ie&&g)H=new Uint8Array(g);else{if(!d)throw"both async and sync fetching of the wasm failed";H=d(H)}return H}(P);return await WebAssembly.instantiate(G,B)}catch(H){E(`failed to asynchronously prepare wasm: ${H}`),U(H)}}(_,f)}(h),a(l.instance,l.module))}class Be{name="ExitStatus";constructor(l){this.message=`Program terminated with exit(${l})`,this.status=l}}var ze=a=>{a.terminate(),a.onmessage=()=>{}},Xe=[],Ce=0,$e=null,Fe=a=>{ft.length==0&&(Ho(),Go(ft[0]));var l=ft.pop();if(!l)return 6;Kt.push(l),It[a.Qc]=l,l.Qc=a.Qc;var h={Rc:"run",Ld:a.Kd,Zc:a.Zc,Qc:a.Qc};return l.postMessage(h,a.qd),0},Ue=0,ve=(a,l,...h)=>{for(var f=2*h.length,_=le(),C=Mn(8*f),P=C>>>3,B=0;B<h.length;B++){var G=h[B];typeof G=="bigint"?((v(),Z)[P+2*B>>>0]=1n,(v(),Z)[P+2*B+1>>>0]=G):((v(),Z)[P+2*B>>>0]=0n,(v(),Y)[P+2*B+1>>>0]=G)}return a=Ri(a,0,f,C,l),de(_),a};function dr(a){if(o)return ve(0,1,a);if(b=a,!(0<Ue)){for(var l of Kt)ze(l);for(l of ft)ze(l);ft=[],Kt=[],It={},A=!0}c(0,new Be(a))}function No(a){if(o)return ve(1,0,a);_n(a)}var _n=a=>{if(b=a,o)throw No(a),"unwind";dr(a)},ft=[],Kt=[],Vo=[],It={},Lo=a=>{var l=a.Qc;delete It[l],ft.push(a),Kt.splice(Kt.indexOf(a),1),a.Qc=0,Ui(l)};function Wo(){Vo.forEach(a=>a())}var Go=a=>new Promise(l=>{a.onmessage=_=>{var C=_.data;if(_=C.Rc,C.Yc&&C.Yc!=vr()){var P=It[C.Yc];P?P.postMessage(C,C.qd):E(`Internal error! Worker sent a message "${_}" to target pthread ${C.Yc}, but that thread no longer exists!`)}else _==="checkMailbox"?fr():_==="spawnThread"?Fe(C):_==="cleanupThread"?mr(()=>{Lo(It[C.Md])}):_==="loaded"?(a.loaded=!0,l(a)):C.target==="setimmediate"?a.postMessage(C):_==="uncaughtException"?a.onerror(C.error):_==="callHandler"?e[C.vd](...C.args):_&&E(`worker sent an unknown command ${_}`)},a.onerror=_=>{throw E(`worker sent an error! ${_.filename}:${_.lineno}: ${_.message}`),_};var h,f=[];for(h of[])e.propertyIsEnumerable(h)&&f.push(h);a.postMessage({Rc:"load",wd:f,Nd:ht,Od:y})});function Ho(){var a=new Worker((()=>{let l=URL;return import.meta.url>"file:"&&import.meta.url<"file;"?new l("ort.bundle.min.mjs",import.meta.url):new URL(import.meta.url)})(),{type:"module",workerData:"em-pthread",name:"em-pthread"});ft.push(a)}var ht,np=(a,l)=>{Ue=0,a=Rn(a,l),0<Ue?b=a:Bn(a)},Fo=globalThis.TextDecoder&&new TextDecoder,qo=(a,l,h,f)=>{if(h=l+h,f)return h;for(;a[l]&&!(l>=h);)++l;return l},Ko=(a,l=0,h,f)=>{if(16<(h=qo(a,l>>>=0,h,f))-l&&a.buffer&&Fo)return Fo.decode(a.buffer instanceof ArrayBuffer?a.subarray(l,h):a.slice(l,h));for(f="";l<h;){var _=a[l++];if(128&_){var C=63&a[l++];if((224&_)==192)f+=String.fromCharCode((31&_)<<6|C);else{var P=63&a[l++];65536>(_=(240&_)==224?(15&_)<<12|C<<6|P:(7&_)<<18|C<<12|P<<6|63&a[l++])?f+=String.fromCharCode(_):(_-=65536,f+=String.fromCharCode(55296|_>>10,56320|1023&_))}}else f+=String.fromCharCode(_)}return f},Ae=(a,l,h)=>(a>>>=0)?Ko((v(),K),a,l,h):"",lr=[],cr=0;function op(a){var l=new vn(a>>>=0);return(v(),N)[l.Sc+12>>>0]==0&&(jo(l,!0),cr--),Zo(l,!1),lr.push(l),Gi(a),Fi(a)}var Ut=0,ip=()=>{ce(0,0);var a=lr.pop();Wi(a.ad),Ut=0};function jo(a,l){l=l?1:0,(v(),N)[a.Sc+12>>>0]=l}function Zo(a,l){l=l?1:0,(v(),N)[a.Sc+13>>>0]=l}class vn{constructor(l){this.ad=l,this.Sc=l-24}}var $n=a=>{var l=Ut;if(!l)return Qt(0),0;var h=new vn(l);(v(),W)[h.Sc+16>>>2>>>0]=l;var f=(v(),W)[h.Sc+4>>>2>>>0];if(!f)return Qt(0),l;for(var _ of a){if(_===0||_===f)break;if(Hi(_,f,h.Sc+16))return Qt(_),l}return Qt(f),l};function ap(){return $n([])}function sp(a){return $n([a>>>0])}function up(a,l,h,f){return $n([a>>>0,l>>>0,h>>>0,f>>>0])}var dp=()=>{var a=lr.pop();a||U("no exception to throw");var l=a.ad;throw(v(),N)[a.Sc+13>>>0]==0&&(lr.push(a),Zo(a,!0),jo(a,!1),cr++),Ut=l};function lp(a,l,h){var f=new vn(a>>>=0);throw l>>>=0,h>>>=0,(v(),W)[f.Sc+16>>>2>>>0]=0,(v(),W)[f.Sc+4>>>2>>>0]=l,(v(),W)[f.Sc+8>>>2>>>0]=h,cr++,Ut=a}var cp=()=>cr;function Qo(a,l,h,f){return o?ve(2,1,a,l,h,f):Yo(a,l,h,f)}function Yo(a,l,h,f){if(a>>>=0,l>>>=0,h>>>=0,f>>>=0,!globalThis.SharedArrayBuffer)return 6;var _=[];return o&&_.length===0?Qo(a,l,h,f):(a={Kd:h,Qc:a,Zc:f,qd:_},o?(a.Rc="spawnThread",postMessage(a,_),0):Fe(a))}function pp(a){throw Ut||=a>>>0,Ut}function Xo(a,l,h){return o?ve(3,1,a,l,h):0}function Jo(a,l){if(o)return ve(4,1,a,l)}function ei(a,l){if(o)return ve(5,1,a,l)}function ti(a,l,h){if(o)return ve(6,1,a,l,h)}function ri(a,l,h){return o?ve(7,1,a,l,h):0}function ni(a,l){if(o)return ve(8,1,a,l)}function oi(a,l,h){if(o)return ve(9,1,a,l,h)}function ii(a,l,h,f){if(o)return ve(10,1,a,l,h,f)}function ai(a,l,h,f){if(o)return ve(11,1,a,l,h,f)}function si(a,l,h,f){if(o)return ve(12,1,a,l,h,f)}function ui(a){if(o)return ve(13,1,a)}function di(a,l){if(o)return ve(14,1,a,l)}function li(a,l,h){if(o)return ve(15,1,a,l,h)}var mp=()=>U(""),Je=a=>{a>>>=0;for(var l="";;){var h=(v(),K)[a++>>>0];if(!h)return l;l+=String.fromCharCode(h)}},xn={},Sn={},fp={},Nt=class extends Error{constructor(a){super(a),this.name="BindingError"}};function lt(a,l,h={}){return function(f,_,C={}){var P=_.name;if(!f)throw new Nt(`type "${P}" must have a positive integer typeid pointer`);if(Sn.hasOwnProperty(f)){if(C.xd)return;throw new Nt(`Cannot register type '${P}' twice`)}Sn[f]=_,delete fp[f],xn.hasOwnProperty(f)&&(_=xn[f],delete xn[f],_.forEach(B=>B()))}(a,l,h)}var ci=(a,l,h)=>{switch(l){case 1:return h?f=>(v(),N)[f>>>0]:f=>(v(),K)[f>>>0];case 2:return h?f=>(v(),q)[f>>>1>>>0]:f=>(v(),Q)[f>>>1>>>0];case 4:return h?f=>(v(),D)[f>>>2>>>0]:f=>(v(),W)[f>>>2>>>0];case 8:return h?f=>(v(),Z)[f>>>3>>>0]:f=>(v(),te)[f>>>3>>>0];default:throw new TypeError(`invalid integer width (${l}): ${a}`)}};function hp(a,l,h,f,_){a>>>=0,h>>>=0,l=Je(l>>>0);let C=P=>P;if(f=f===0n){let P=8*h;C=B=>BigInt.asUintN(P,B),_=C(_)}lt(a,{name:l,Nc:C,Uc:(P,B)=>(typeof B=="number"&&(B=BigInt(B)),B),Tc:ci(l,h,!f),Vc:null})}function gp(a,l,h,f){lt(a>>>=0,{name:l=Je(l>>>0),Nc:function(_){return!!_},Uc:function(_,C){return C?h:f},Tc:function(_){return this.Nc((v(),K)[_>>>0])},Vc:null})}var pi=[],Ct=[0,1,,1,null,1,!0,1,!1,1];function Tn(a){9<(a>>>=0)&&--Ct[a+1]==0&&(Ct[a]=void 0,pi.push(a))}var Ge=a=>{if(!a)throw new Nt(`Cannot use deleted val. handle = ${a}`);return Ct[a]},qe=a=>{switch(a){case void 0:return 2;case null:return 4;case!0:return 6;case!1:return 8;default:let l=pi.pop()||Ct.length;return Ct[l]=a,Ct[l+1]=1,l}};function In(a){return this.Nc((v(),W)[a>>>2>>>0])}var bp={name:"emscripten::val",Nc:a=>{var l=Ge(a);return Tn(a),l},Uc:(a,l)=>qe(l),Tc:In,Vc:null};function yp(a){return lt(a>>>0,bp)}var wp=(a,l)=>{switch(l){case 4:return function(h){return this.Nc((v(),j)[h>>>2>>>0])};case 8:return function(h){return this.Nc((v(),Y)[h>>>3>>>0])};default:throw new TypeError(`invalid float width (${l}): ${a}`)}};function _p(a,l,h){h>>>=0,lt(a>>>=0,{name:l=Je(l>>>0),Nc:f=>f,Uc:(f,_)=>_,Tc:wp(l,h),Vc:null})}function vp(a,l,h,f,_){a>>>=0,h>>>=0,l=Je(l>>>0);let C=B=>B;if(f===0){var P=32-8*h;C=B=>B<<P>>>P,_=C(_)}lt(a,{name:l,Nc:C,Uc:(B,G)=>G,Tc:ci(l,h,f!==0),Vc:null})}function $p(a,l,h){function f(C){var P=(v(),W)[C>>>2>>>0];return C=(v(),W)[C+4>>>2>>>0],new _((v(),N).buffer,C,P)}var _=[Int8Array,Uint8Array,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array][l];lt(a>>>=0,{name:h=Je(h>>>0),Nc:f,Tc:f},{xd:!0})}var gt=(a,l,h)=>{var f=(v(),K);if(l>>>=0,0<h){var _=l;h=l+h-1;for(var C=0;C<a.length;++C){var P=a.codePointAt(C);if(127>=P){if(l>=h)break;f[l++>>>0]=P}else if(2047>=P){if(l+1>=h)break;f[l++>>>0]=192|P>>6,f[l++>>>0]=128|63&P}else if(65535>=P){if(l+2>=h)break;f[l++>>>0]=224|P>>12,f[l++>>>0]=128|P>>6&63,f[l++>>>0]=128|63&P}else{if(l+3>=h)break;f[l++>>>0]=240|P>>18,f[l++>>>0]=128|P>>12&63,f[l++>>>0]=128|P>>6&63,f[l++>>>0]=128|63&P,C++}}f[l>>>0]=0,a=l-_}else a=0;return a},pr=a=>{for(var l=0,h=0;h<a.length;++h){var f=a.charCodeAt(h);127>=f?l++:2047>=f?l+=2:55296<=f&&57343>=f?(l+=4,++h):l+=3}return l};function xp(a,l){lt(a>>>=0,{name:l=Je(l>>>0),Nc(h){var f=(v(),W)[h>>>2>>>0];return f=Ae(h+4,f,!0),tt(h),f},Uc(h,f){f instanceof ArrayBuffer&&(f=new Uint8Array(f));var _=typeof f=="string";if(!(_||ArrayBuffer.isView(f)&&f.BYTES_PER_ELEMENT==1))throw new Nt("Cannot pass non-string to std::string");var C=_?pr(f):f.length,P=Zt(4+C+1),B=P+4;return(v(),W)[P>>>2>>>0]=C,_?gt(f,B,C+1):(v(),K).set(f,B>>>0),h!==null&&h.push(tt,P),P},Tc:In,Vc(h){tt(h)}})}var mi=globalThis.TextDecoder?new TextDecoder("utf-16le"):void 0,Sp=(a,l,h)=>{if(a>>>=1,16<(l=qo((v(),Q),a,l/2,h))-a&&mi)return mi.decode((v(),Q).slice(a,l));for(h="";a<l;++a){var f=(v(),Q)[a>>>0];h+=String.fromCharCode(f)}return h},Tp=(a,l,h)=>{if(h??=2147483647,2>h)return 0;var f=l;h=(h-=2)<2*a.length?h/2:a.length;for(var _=0;_<h;++_){var C=a.charCodeAt(_);(v(),q)[l>>>1>>>0]=C,l+=2}return(v(),q)[l>>>1>>>0]=0,l-f},Ip=a=>2*a.length,Cp=(a,l,h)=>{var f="";a>>>=2;for(var _=0;!(_>=l/4);_++){var C=(v(),W)[a+_>>>0];if(!C&&!h)break;f+=String.fromCodePoint(C)}return f},Ap=(a,l,h)=>{if(l>>>=0,h??=2147483647,4>h)return 0;var f=l;h=f+h-4;for(var _=0;_<a.length;++_){var C=a.codePointAt(_);if(65535<C&&_++,(v(),D)[l>>>2>>>0]=C,(l+=4)+4>h)break}return(v(),D)[l>>>2>>>0]=0,l-f},Ep=a=>{for(var l=0,h=0;h<a.length;++h)65535<a.codePointAt(h)&&h++,l+=4;return l};function kp(a,l,h){if(a>>>=0,l>>>=0,h=Je(h>>>=0),l===2)var f=Sp,_=Tp,C=Ip;else f=Cp,_=Ap,C=Ep;lt(a,{name:h,Nc:P=>{var B=(v(),W)[P>>>2>>>0];return B=f(P+4,B*l,!0),tt(P),B},Uc:(P,B)=>{if(typeof B!="string")throw new Nt(`Cannot pass non-string to C++ string type ${h}`);var G=C(B),H=Zt(4+G+l);return(v(),W)[H>>>2>>>0]=G/l,_(B,H+4,G+l),P!==null&&P.push(tt,H),H},Tc:In,Vc(P){tt(P)}})}function Pp(a,l){lt(a>>>=0,{yd:!0,name:l=Je(l>>>0),Nc:()=>{},Uc:()=>{}})}function Op(a){Dn(a>>>0,!n,1,!r,131072,!1),Wo()}var mr=a=>{if(!A)try{if(a(),!(0<Ue))try{o?vr()&&Bn(b):_n(b)}catch(l){l instanceof Be||l=="unwind"||c(0,l)}}catch(l){l instanceof Be||l=="unwind"||c(0,l)}},zp=!Atomics.waitAsync||globalThis.navigator?.userAgent&&91>Number((navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./)||[])[2]);function Cn(a){a>>>=0,zp||(Atomics.waitAsync((v(),D),a>>>2,a).value.then(fr),a+=128,Atomics.store((v(),D),a>>>2,1))}var fr=()=>mr(()=>{var a=vr();a&&(Cn(a),Vi())});function Dp(a,l){(a>>>=0)==l>>>0?setTimeout(fr):o?postMessage({Yc:a,Rc:"checkMailbox"}):(a=It[a])&&a.postMessage({Rc:"checkMailbox"})}var hr=[];function Bp(a,l,h,f,_){for(l>>>=0,f/=2,hr.length=f,h=_>>>0>>>3,_=0;_<f;_++)(v(),Z)[h+2*_>>>0]?hr[_]=(v(),Z)[h+2*_+1>>>0]:hr[_]=(v(),Y)[h+2*_+1>>>0];return(l?Un[l]:Tm[a])(...hr)}var Mp=()=>{Ue=0};function Rp(a){a>>>=0,o?postMessage({Rc:"cleanupThread",Md:a}):Lo(It[a])}function Up(a){}var gr=a=>{try{a()}catch(l){U(l)}};function Np(a){var l=(...h)=>{br.push(a);try{return a(...h)}finally{A||(br.pop(),et&&bt===1&&br.length===0&&(bt=0,Ue+=1,gr(Ea),typeof Fibers<"u"&&Fibers.Zd()))}};return gi.set(a,l),l}var bt=0,et=null,fi=0,br=[],An=new Map,hi=new Map,gi=new Map,Vp=0,En=null,Lp=[],bi=a=>function(l){if(!A){if(bt===0){var h=!1,f=!1;l((_=0)=>{if(!A&&(fi=_,h=!0,f)){bt=2,gr(()=>ka(et)),typeof MainLoop<"u"&&MainLoop.td&&MainLoop.resume(),_=!1;try{var C=function(){var G=(v(),D)[et+8>>>2>>>0];return G=hi.get(G),G=gi.get(G),--Ue,G()}()}catch(G){C=G,_=!0}var P=!1;if(!et){var B=En;B&&(En=null,(_?B.reject:B.resolve)(C),P=!0)}if(_&&!P)throw C}}),f=!0,h||(bt=1,et=function(){var _=Zt(65548),C=_+12;if((v(),W)[_>>>2>>>0]=C,(v(),W)[_+4>>>2>>>0]=C+65536,C=br[0],!An.has(C)){var P=Vp++;An.set(C,P),hi.set(P,C)}return C=An.get(C),(v(),D)[_+8>>>2>>>0]=C,_}(),typeof MainLoop<"u"&&MainLoop.td&&MainLoop.pause(),gr(()=>Aa(et)))}else bt===2?(bt=0,gr(Pa),tt(et),et=null,Lp.forEach(mr)):U(`invalid state: ${bt}`);return fi}}(l=>{a().then(l)});function Wp(a){return a>>>=0,bi(async()=>{var l=await Ge(a);return qe(l)})}var kn=[],Gp=a=>{var l=kn.length;return kn.push(a),l},Hp=(a,l)=>{for(var h=Array(a),f=0;f<a;++f){var _=f,C=(v(),W)[l+4*f>>>2>>>0],P=Sn[C];if(P===void 0)throw a=`parameter ${f}`,C=Di(C),l=Je(C),tt(C),new Nt(`${a} has unknown type ${l}`);h[_]=P}return h},Fp=(a,l,h)=>{var f=[];return a=a(f,h),f.length&&((v(),W)[l>>>2>>>0]=qe(f)),a},qp={},yr=a=>{var l=qp[a];return l===void 0?Je(a):l};function Kp(a,l,h){var[f,..._]=Hp(a,l>>>0);l=f.Uc.bind(f);var C=_.map(G=>G.Tc.bind(G));a--;var P={toValue:Ge};switch(a=C.map((G,H)=>{var ue=`argFromPtr${H}`;return P[ue]=G,`${ue}(args${H?"+"+8*H:""})`}),h){case 0:var B="toValue(handle)";break;case 2:B="new (toValue(handle))";break;case 3:B="";break;case 1:P.getStringOrSymbol=yr,B="toValue(handle)[getStringOrSymbol(methodName)]"}return B+=`(${a})`,f.yd||(P.toReturnWire=l,P.emval_returnValue=Fp,B=`return emval_returnValue(toReturnWire, destructorsRef, ${B})`),B=`return function (handle, methodName, destructorsRef, args) {
  ${B}
  }`,h=new Function(Object.keys(P),B)(...Object.values(P)),B=`methodCaller<(${_.map(G=>G.name)}) => ${f.name}>`,Gp(Object.defineProperty(h,"name",{value:B}))}function jp(a,l){return l>>>=0,(a=Ge(a>>>0))==Ge(l)}function Zp(a){return(a>>>=0)?(a=yr(a),qe(globalThis[a])):qe(globalThis)}function Qp(a){return a=yr(a>>>0),qe(e[a])}function Yp(a,l){return l>>>=0,a=Ge(a>>>0),l=Ge(l),qe(a[l])}function Xp(a){9<(a>>>=0)&&(Ct[a+1]+=1)}function yi(a,l,h,f,_){return kn[a>>>0](l>>>0,h>>>0,f>>>0,_>>>0)}function Jp(){return qe([])}function em(a){a=Ge(a>>>0);for(var l=Array(a.length),h=0;h<a.length;h++)l[h]=a[h];return qe(l)}function tm(a){return qe(yr(a>>>0))}function rm(){return qe({})}function nm(a){for(var l=Ge(a>>>=0);l.length;){var h=l.pop();l.pop()(h)}Tn(a)}function om(a,l,h){l>>>=0,h>>>=0,a=Ge(a>>>0),l=Ge(l),h=Ge(h),a[l]=h}function im(a,l){a=-9007199254740992>a||9007199254740992<a?NaN:Number(a),l>>>=0,a=new Date(1e3*a),(v(),D)[l>>>2>>>0]=a.getUTCSeconds(),(v(),D)[l+4>>>2>>>0]=a.getUTCMinutes(),(v(),D)[l+8>>>2>>>0]=a.getUTCHours(),(v(),D)[l+12>>>2>>>0]=a.getUTCDate(),(v(),D)[l+16>>>2>>>0]=a.getUTCMonth(),(v(),D)[l+20>>>2>>>0]=a.getUTCFullYear()-1900,(v(),D)[l+24>>>2>>>0]=a.getUTCDay(),a=(a.getTime()-Date.UTC(a.getUTCFullYear(),0,1,0,0,0,0))/864e5|0,(v(),D)[l+28>>>2>>>0]=a}var wi=a=>a%4==0&&(a%100!=0||a%400==0),_i=[0,31,60,91,121,152,182,213,244,274,305,335],vi=[0,31,59,90,120,151,181,212,243,273,304,334];function am(a,l){a=-9007199254740992>a||9007199254740992<a?NaN:Number(a),l>>>=0,a=new Date(1e3*a),(v(),D)[l>>>2>>>0]=a.getSeconds(),(v(),D)[l+4>>>2>>>0]=a.getMinutes(),(v(),D)[l+8>>>2>>>0]=a.getHours(),(v(),D)[l+12>>>2>>>0]=a.getDate(),(v(),D)[l+16>>>2>>>0]=a.getMonth(),(v(),D)[l+20>>>2>>>0]=a.getFullYear()-1900,(v(),D)[l+24>>>2>>>0]=a.getDay();var h=(wi(a.getFullYear())?_i:vi)[a.getMonth()]+a.getDate()-1|0;(v(),D)[l+28>>>2>>>0]=h,(v(),D)[l+36>>>2>>>0]=-60*a.getTimezoneOffset(),h=new Date(a.getFullYear(),6,1).getTimezoneOffset();var f=new Date(a.getFullYear(),0,1).getTimezoneOffset();a=0|(h!=f&&a.getTimezoneOffset()==Math.min(f,h)),(v(),D)[l+32>>>2>>>0]=a}function sm(a){a>>>=0;var l=new Date((v(),D)[a+20>>>2>>>0]+1900,(v(),D)[a+16>>>2>>>0],(v(),D)[a+12>>>2>>>0],(v(),D)[a+8>>>2>>>0],(v(),D)[a+4>>>2>>>0],(v(),D)[a>>>2>>>0],0),h=(v(),D)[a+32>>>2>>>0],f=l.getTimezoneOffset(),_=new Date(l.getFullYear(),6,1).getTimezoneOffset(),C=new Date(l.getFullYear(),0,1).getTimezoneOffset(),P=Math.min(C,_);return 0>h?(v(),D)[a+32>>>2>>>0]=+(_!=C&&P==f):0<h!=(P==f)&&(_=Math.max(C,_),l.setTime(l.getTime()+6e4*((0<h?P:_)-f))),(v(),D)[a+24>>>2>>>0]=l.getDay(),h=(wi(l.getFullYear())?_i:vi)[l.getMonth()]+l.getDate()-1|0,(v(),D)[a+28>>>2>>>0]=h,(v(),D)[a>>>2>>>0]=l.getSeconds(),(v(),D)[a+4>>>2>>>0]=l.getMinutes(),(v(),D)[a+8>>>2>>>0]=l.getHours(),(v(),D)[a+12>>>2>>>0]=l.getDate(),(v(),D)[a+16>>>2>>>0]=l.getMonth(),(v(),D)[a+20>>>2>>>0]=l.getYear(),a=l.getTime(),BigInt(isNaN(a)?-1:a/1e3)}function $i(a,l,h,f,_,C,P){return o?ve(16,1,a,l,h,f,_,C,P):-52}function xi(a,l,h,f,_,C){if(o)return ve(17,1,a,l,h,f,_,C)}var jt={},um=()=>performance.timeOrigin+performance.now();function Si(a,l){if(o)return ve(18,1,a,l);if(jt[a]&&(clearTimeout(jt[a].id),delete jt[a]),!l)return 0;var h=setTimeout(()=>{delete jt[a],mr(()=>Ni(a,performance.timeOrigin+performance.now()))},l);return jt[a]={id:h,Yd:l},0}function dm(a,l,h,f){a>>>=0,l>>>=0,h>>>=0,f>>>=0;var _=new Date().getFullYear(),C=new Date(_,0,1).getTimezoneOffset();_=new Date(_,6,1).getTimezoneOffset();var P=Math.max(C,_);(v(),W)[a>>>2>>>0]=60*P,(v(),D)[l>>>2>>>0]=+(C!=_),a=(l=B=>{var G=Math.abs(B);return`UTC${0<=B?"-":"+"}${String(Math.floor(G/60)).padStart(2,"0")}${String(G%60).padStart(2,"0")}`})(C),l=l(_),_<C?(gt(a,h,17),gt(l,f,17)):(gt(a,f,17),gt(l,h,17))}var lm=()=>Date.now(),cm=1;function pm(a,l,h){if(h>>>=0,!(0<=a&&3>=a))return 28;if(a===0)a=Date.now();else{if(!cm)return 52;a=performance.timeOrigin+performance.now()}return a=Math.round(1e6*a),(v(),Z)[h>>>3>>>0]=BigInt(a),0}var Pn=[],Ti=(a,l)=>{Pn.length=0;for(var h;h=(v(),K)[a++>>>0];){var f=h!=105;l+=(f&=h!=112)&&l%8?4:0,Pn.push(h==112?(v(),W)[l>>>2>>>0]:h==106?(v(),Z)[l>>>3>>>0]:h==105?(v(),D)[l>>>2>>>0]:(v(),Y)[l>>>3>>>0]),l+=f?8:4}return Pn};function mm(a,l,h){return a>>>=0,l=Ti(l>>>0,h>>>0),Un[a](...l)}function fm(a,l,h){return a>>>=0,l=Ti(l>>>0,h>>>0),Un[a](...l)}var hm=()=>{};function gm(a,l){return E(Ae(a>>>0,l>>>0))}var bm=()=>{throw Ue+=1,"unwind"};function ym(){return 4294901760}var wm=()=>navigator.hardwareConcurrency,At={},wr=a=>{var l;return(l=/\bwasm-function\[\d+\]:(0x[0-9a-f]+)/.exec(a))?+l[1]:(l=/:(\d+):\d+(?:\)|$)/.exec(a))?2147483648|+l[1]:0},Ii=a=>{for(var l of a)(a=wr(l))&&(At[a]=l)};function _m(){var a=Error().stack.toString().split(`
`);return a[0]=="Error"&&a.shift(),Ii(a),At.dd=wr(a[3]),At.Id=a,At.dd}function _r(a){if(!(a=At[a>>>0]))return 0;var l;if(l=/^\s+at .*\.wasm\.(.*) \(.*\)$/.exec(a))a=l[1];else if(l=/^\s+at (.*) \(.*\)$/.exec(a))a=l[1];else{if(!(l=/^(.+?)@/.exec(a)))return 0;a=l[1]}tt(_r.gd??0),l=pr(a)+1;var h=Zt(l);return h&&gt(a,h,l),_r.gd=h,_r.gd}function vm(a){a>>>=0;var l=(v(),K).length;if(a<=l||4294901760<a)return!1;for(var h=1;4>=h;h*=2){var f=l*(1+.2/h);f=Math.min(f,a+100663296);e:{f=(Math.min(4294901760,65536*Math.ceil(Math.max(a,f)/65536))-ht.buffer.byteLength+65535)/65536|0;try{ht.grow(f),Te();var _=1;break e}catch{}_=void 0}if(_)return!0}return!1}function $m(a,l,h){if(a>>>=0,l>>>=0,At.dd==a)var f=At.Id;else(f=Error().stack.toString().split(`
`))[0]=="Error"&&f.shift(),Ii(f);for(var _=3;f[_]&&wr(f[_])!=a;)++_;for(a=0;a<h&&f[a+_];++a)(v(),D)[l+4*a>>>2>>>0]=wr(f[a+_]);return a}var On,zn={},Ci=()=>{if(!On){var a,l={USER:"web_user",LOGNAME:"web_user",PATH:"/",PWD:"/",HOME:"/home/web_user",LANG:(globalThis.navigator?.language??"C").replace("-","_")+".UTF-8",_:"./this.program"};for(a in zn)zn[a]===void 0?delete l[a]:l[a]=zn[a];var h=[];for(a in l)h.push(`${a}=${l[a]}`);On=h}return On};function Ai(a,l){if(o)return ve(19,1,a,l);a>>>=0,l>>>=0;var h,f=0,_=0;for(h of Ci()){var C=l+f;(v(),W)[a+_>>>2>>>0]=C,f+=gt(h,C,1/0)+1,_+=4}return 0}function Ei(a,l){if(o)return ve(20,1,a,l);a>>>=0,l>>>=0;var h=Ci();for(var f of((v(),W)[a>>>2>>>0]=h.length,a=0,h))a+=pr(f)+1;return(v(),W)[l>>>2>>>0]=a,0}function ki(a){return o?ve(21,1,a):52}function Pi(a,l,h,f){return o?ve(22,1,a,l,h,f):52}function Oi(a,l,h,f){return o?ve(23,1,a,l,h,f):70}var xm=[null,[],[]];function zi(a,l,h,f){if(o)return ve(24,1,a,l,h,f);l>>>=0,h>>>=0,f>>>=0;for(var _=0,C=0;C<h;C++){var P=(v(),W)[l>>>2>>>0],B=(v(),W)[l+4>>>2>>>0];l+=8;for(var G=0;G<B;G++){var H=a,ue=(v(),K)[P+G>>>0],pe=xm[H];ue===0||ue===10?((H===1?I:E)(Ko(pe)),pe.length=0):pe.push(ue)}_+=B}return(v(),W)[f>>>2>>>0]=_,0}function Sm(a){return a>>>0}o||function(){for(var a=e.numThreads-1;a--;)Ho();Xe.push(async()=>{var l=async function(){if(!o)return Promise.all(ft.map(Go))}();Ce++,await l,--Ce==0&&$e&&(l=$e,$e=null,l())})}(),o||(ht=new WebAssembly.Memory({initial:256,maximum:65536,shared:!0}),Te()),e.wasmBinary&&(g=e.wasmBinary),e.stackSave=()=>le(),e.stackRestore=a=>de(a),e.stackAlloc=a=>Mn(a),e.setValue=function(a,l,h="i8"){switch(h.endsWith("*")&&(h="*"),h){case"i1":case"i8":(v(),N)[a>>>0]=l;break;case"i16":(v(),q)[a>>>1>>>0]=l;break;case"i32":(v(),D)[a>>>2>>>0]=l;break;case"i64":(v(),Z)[a>>>3>>>0]=BigInt(l);break;case"float":(v(),j)[a>>>2>>>0]=l;break;case"double":(v(),Y)[a>>>3>>>0]=l;break;case"*":(v(),W)[a>>>2>>>0]=l;break;default:U(`invalid type for setValue: ${h}`)}},e.getValue=function(a,l="i8"){switch(l.endsWith("*")&&(l="*"),l){case"i1":case"i8":return(v(),N)[a>>>0];case"i16":return(v(),q)[a>>>1>>>0];case"i32":return(v(),D)[a>>>2>>>0];case"i64":return(v(),Z)[a>>>3>>>0];case"float":return(v(),j)[a>>>2>>>0];case"double":return(v(),Y)[a>>>3>>>0];case"*":return(v(),W)[a>>>2>>>0];default:U(`invalid type for getValue: ${l}`)}},e.UTF8ToString=Ae,e.stringToUTF8=gt,e.lengthBytesUTF8=pr;var Di,Bi,vr,tt,Zt,Dn,Mi,Ri,Ui,Bn,Ni,Vi,ce,Qt,Li,de,Mn,le,Wi,Gi,Hi,Fi,qi,Rn,Ki,ji,Zi,Qi,Yi,Xi,Ji,ea,ta,ra,na,oa,ia,aa,sa,ua,da,la,ca,pa,ma,fa,ha,ga,ba,ya,wa,_a,va,$a,xa,Sa,Ta,Ia,Ca,Aa,Ea,ka,Pa,ct,Tm=[dr,No,Qo,Xo,Jo,ei,ti,ri,ni,oi,ii,ai,si,ui,di,li,$i,xi,Si,Ai,Ei,ki,Pi,Oi,zi],Un={915180:(a,l,h,f,_)=>{if(e===void 0||!e.Wc)return 1;if((a=Ae(Number(a>>>0))).startsWith("./")&&(a=a.substring(2)),!(a=e.Wc.get(a)))return 2;if(l=Number(l>>>0),h=Number(h>>>0),f=Number(f>>>0),l+h>a.byteLength)return 3;try{let C=a.subarray(l,l+h);switch(_){case 0:(v(),K).set(C,f>>>0);break;case 1:e.Pd?e.Pd(f,C):e.Hd(f,C);break;default:return 4}return 0}catch{return 4}},916004:(a,l,h)=>{e.sd(a,(v(),K).subarray(l>>>0,l+h>>>0))},916068:()=>e.Vd(),916110:a=>{e.rd(a)},916147:()=>{e.Ad()},916178:()=>{e.Bd()},916207:()=>{e.Fd()},916232:a=>e.zd(a),916265:a=>e.Dd(a),916297:(a,l,h)=>{e.cd(Number(a),Number(l),Number(h),!0)},916360:(a,l,h)=>{e.cd(Number(a),Number(l),Number(h))},916417:()=>typeof wasmOffsetConverter<"u",916474:a=>{e.$b("Abs",a,void 0)},916525:a=>{e.$b("Neg",a,void 0)},916576:a=>{e.$b("Floor",a,void 0)},916629:a=>{e.$b("Ceil",a,void 0)},916681:a=>{e.$b("Reciprocal",a,void 0)},916739:a=>{e.$b("Sqrt",a,void 0)},916791:a=>{e.$b("Exp",a,void 0)},916842:a=>{e.$b("Erf",a,void 0)},916893:a=>{e.$b("Sigmoid",a,void 0)},916948:(a,l,h)=>{e.$b("HardSigmoid",a,{alpha:l,beta:h})},917027:a=>{e.$b("Log",a,void 0)},917078:a=>{e.$b("Sin",a,void 0)},917129:a=>{e.$b("Cos",a,void 0)},917180:a=>{e.$b("Tan",a,void 0)},917231:a=>{e.$b("Asin",a,void 0)},917283:a=>{e.$b("Acos",a,void 0)},917335:a=>{e.$b("Atan",a,void 0)},917387:a=>{e.$b("Sinh",a,void 0)},917439:a=>{e.$b("Cosh",a,void 0)},917491:a=>{e.$b("Asinh",a,void 0)},917544:a=>{e.$b("Acosh",a,void 0)},917597:a=>{e.$b("Atanh",a,void 0)},917650:a=>{e.$b("Tanh",a,void 0)},917702:a=>{e.$b("Not",a,void 0)},917753:(a,l,h)=>{e.$b("Clip",a,{min:l,max:h})},917822:a=>{e.$b("Clip",a,void 0)},917874:(a,l)=>{e.$b("Elu",a,{alpha:l})},917932:a=>{e.$b("Gelu",a,void 0)},917984:a=>{e.$b("Relu",a,void 0)},918036:(a,l)=>{e.$b("LeakyRelu",a,{alpha:l})},918100:(a,l)=>{e.$b("ThresholdedRelu",a,{alpha:l})},918170:(a,l)=>{e.$b("Cast",a,{to:l})},918228:a=>{e.$b("Add",a,void 0)},918279:a=>{e.$b("Sub",a,void 0)},918330:a=>{e.$b("Mul",a,void 0)},918381:a=>{e.$b("Div",a,void 0)},918432:a=>{e.$b("Pow",a,void 0)},918483:a=>{e.$b("Equal",a,void 0)},918536:a=>{e.$b("Greater",a,void 0)},918591:a=>{e.$b("GreaterOrEqual",a,void 0)},918653:a=>{e.$b("Less",a,void 0)},918705:a=>{e.$b("LessOrEqual",a,void 0)},918764:(a,l,h,f,_)=>{e.$b("ReduceMean",a,{keepDims:!!l,noopWithEmptyAxes:!!h,axes:f?Array.from((v(),D).subarray(Number(f)>>>0,Number(_)>>>0)):[]})},918939:(a,l,h,f,_)=>{e.$b("ReduceMax",a,{keepDims:!!l,noopWithEmptyAxes:!!h,axes:f?Array.from((v(),D).subarray(Number(f)>>>0,Number(_)>>>0)):[]})},919113:(a,l,h,f,_)=>{e.$b("ReduceMin",a,{keepDims:!!l,noopWithEmptyAxes:!!h,axes:f?Array.from((v(),D).subarray(Number(f)>>>0,Number(_)>>>0)):[]})},919287:(a,l,h,f,_)=>{e.$b("ReduceProd",a,{keepDims:!!l,noopWithEmptyAxes:!!h,axes:f?Array.from((v(),D).subarray(Number(f)>>>0,Number(_)>>>0)):[]})},919462:(a,l,h,f,_)=>{e.$b("ReduceSum",a,{keepDims:!!l,noopWithEmptyAxes:!!h,axes:f?Array.from((v(),D).subarray(Number(f)>>>0,Number(_)>>>0)):[]})},919636:(a,l,h,f,_)=>{e.$b("ReduceL1",a,{keepDims:!!l,noopWithEmptyAxes:!!h,axes:f?Array.from((v(),D).subarray(Number(f)>>>0,Number(_)>>>0)):[]})},919809:(a,l,h,f,_)=>{e.$b("ReduceL2",a,{keepDims:!!l,noopWithEmptyAxes:!!h,axes:f?Array.from((v(),D).subarray(Number(f)>>>0,Number(_)>>>0)):[]})},919982:(a,l,h,f,_)=>{e.$b("ReduceLogSum",a,{keepDims:!!l,noopWithEmptyAxes:!!h,axes:f?Array.from((v(),D).subarray(Number(f)>>>0,Number(_)>>>0)):[]})},920159:(a,l,h,f,_)=>{e.$b("ReduceSumSquare",a,{keepDims:!!l,noopWithEmptyAxes:!!h,axes:f?Array.from((v(),D).subarray(Number(f)>>>0,Number(_)>>>0)):[]})},920339:(a,l,h,f,_)=>{e.$b("ReduceLogSumExp",a,{keepDims:!!l,noopWithEmptyAxes:!!h,axes:f?Array.from((v(),D).subarray(Number(f)>>>0,Number(_)>>>0)):[]})},920519:a=>{e.$b("Where",a,void 0)},920572:(a,l,h)=>{e.$b("Transpose",a,{perm:l?Array.from((v(),D).subarray(Number(l)>>>0,Number(h)>>>0)):[]})},920696:(a,l,h,f)=>{e.$b("DepthToSpace",a,{blocksize:l,mode:Ae(h),format:f?"NHWC":"NCHW"})},920829:(a,l,h,f)=>{e.$b("DepthToSpace",a,{blocksize:l,mode:Ae(h),format:f?"NHWC":"NCHW"})},920962:(a,l,h,f,_,C,P,B,G,H,ue,pe,_e,xe,yt)=>{e.$b("ConvTranspose",a,{format:G?"NHWC":"NCHW",autoPad:l,dilations:[h],group:f,kernelShape:[_],pads:[C,P],strides:[B],wIsConst:()=>!!(v(),N)[H>>>0],outputPadding:ue?Array.from((v(),D).subarray(Number(ue)>>>0,Number(pe)>>>0)):[],outputShape:_e?Array.from((v(),D).subarray(Number(_e)>>>0,Number(xe)>>>0)):[],activation:Ae(yt)})},921395:(a,l,h,f,_,C,P,B,G,H,ue,pe,_e,xe)=>{e.$b("ConvTranspose",a,{format:B?"NHWC":"NCHW",autoPad:l,dilations:Array.from((v(),D).subarray(Number(h)>>>0,2+(Number(h)>>>0)>>>0)),group:f,kernelShape:Array.from((v(),D).subarray(Number(_)>>>0,2+(Number(_)>>>0)>>>0)),pads:Array.from((v(),D).subarray(Number(C)>>>0,4+(Number(C)>>>0)>>>0)),strides:Array.from((v(),D).subarray(Number(P)>>>0,2+(Number(P)>>>0)>>>0)),wIsConst:()=>!!(v(),N)[G>>>0],outputPadding:H?Array.from((v(),D).subarray(Number(H)>>>0,Number(ue)>>>0)):[],outputShape:pe?Array.from((v(),D).subarray(Number(pe)>>>0,Number(_e)>>>0)):[],activation:Ae(xe)})},922056:(a,l,h,f,_,C,P,B,G,H,ue,pe,_e,xe,yt)=>{e.$b("ConvTranspose",a,{format:G?"NHWC":"NCHW",autoPad:l,dilations:[h],group:f,kernelShape:[_],pads:[C,P],strides:[B],wIsConst:()=>!!(v(),N)[H>>>0],outputPadding:ue?Array.from((v(),D).subarray(Number(ue)>>>0,Number(pe)>>>0)):[],outputShape:_e?Array.from((v(),D).subarray(Number(_e)>>>0,Number(xe)>>>0)):[],activation:Ae(yt)})},922489:(a,l,h,f,_,C,P,B,G,H,ue,pe,_e,xe)=>{e.$b("ConvTranspose",a,{format:B?"NHWC":"NCHW",autoPad:l,dilations:Array.from((v(),D).subarray(Number(h)>>>0,2+(Number(h)>>>0)>>>0)),group:f,kernelShape:Array.from((v(),D).subarray(Number(_)>>>0,2+(Number(_)>>>0)>>>0)),pads:Array.from((v(),D).subarray(Number(C)>>>0,4+(Number(C)>>>0)>>>0)),strides:Array.from((v(),D).subarray(Number(P)>>>0,2+(Number(P)>>>0)>>>0)),wIsConst:()=>!!(v(),N)[G>>>0],outputPadding:H?Array.from((v(),D).subarray(Number(H)>>>0,Number(ue)>>>0)):[],outputShape:pe?Array.from((v(),D).subarray(Number(pe)>>>0,Number(_e)>>>0)):[],activation:Ae(xe)})},923150:(a,l)=>{e.$b("GlobalAveragePool",a,{format:l?"NHWC":"NCHW"})},923241:(a,l,h,f,_,C,P,B,G,H,ue,pe,_e,xe)=>{e.$b("AveragePool",a,{format:xe?"NHWC":"NCHW",auto_pad:l,ceil_mode:h,count_include_pad:f,storage_order:_,dilations:C?Array.from((v(),D).subarray(Number(C)>>>0,Number(P)>>>0)):[],kernel_shape:B?Array.from((v(),D).subarray(Number(B)>>>0,Number(G)>>>0)):[],pads:H?Array.from((v(),D).subarray(Number(H)>>>0,Number(ue)>>>0)):[],strides:pe?Array.from((v(),D).subarray(Number(pe)>>>0,Number(_e)>>>0)):[]})},923720:(a,l)=>{e.$b("GlobalAveragePool",a,{format:l?"NHWC":"NCHW"})},923811:(a,l,h,f,_,C,P,B,G,H,ue,pe,_e,xe)=>{e.$b("AveragePool",a,{format:xe?"NHWC":"NCHW",auto_pad:l,ceil_mode:h,count_include_pad:f,storage_order:_,dilations:C?Array.from((v(),D).subarray(Number(C)>>>0,Number(P)>>>0)):[],kernel_shape:B?Array.from((v(),D).subarray(Number(B)>>>0,Number(G)>>>0)):[],pads:H?Array.from((v(),D).subarray(Number(H)>>>0,Number(ue)>>>0)):[],strides:pe?Array.from((v(),D).subarray(Number(pe)>>>0,Number(_e)>>>0)):[]})},924290:(a,l)=>{e.$b("GlobalMaxPool",a,{format:l?"NHWC":"NCHW"})},924377:(a,l,h,f,_,C,P,B,G,H,ue,pe,_e,xe)=>{e.$b("MaxPool",a,{format:xe?"NHWC":"NCHW",auto_pad:l,ceil_mode:h,count_include_pad:f,storage_order:_,dilations:C?Array.from((v(),D).subarray(Number(C)>>>0,Number(P)>>>0)):[],kernel_shape:B?Array.from((v(),D).subarray(Number(B)>>>0,Number(G)>>>0)):[],pads:H?Array.from((v(),D).subarray(Number(H)>>>0,Number(ue)>>>0)):[],strides:pe?Array.from((v(),D).subarray(Number(pe)>>>0,Number(_e)>>>0)):[]})},924852:(a,l)=>{e.$b("GlobalMaxPool",a,{format:l?"NHWC":"NCHW"})},924939:(a,l,h,f,_,C,P,B,G,H,ue,pe,_e,xe)=>{e.$b("MaxPool",a,{format:xe?"NHWC":"NCHW",auto_pad:l,ceil_mode:h,count_include_pad:f,storage_order:_,dilations:C?Array.from((v(),D).subarray(Number(C)>>>0,Number(P)>>>0)):[],kernel_shape:B?Array.from((v(),D).subarray(Number(B)>>>0,Number(G)>>>0)):[],pads:H?Array.from((v(),D).subarray(Number(H)>>>0,Number(ue)>>>0)):[],strides:pe?Array.from((v(),D).subarray(Number(pe)>>>0,Number(_e)>>>0)):[]})},925414:(a,l,h,f,_)=>{e.$b("Gemm",a,{alpha:l,beta:h,transA:f,transB:_})},925518:a=>{e.$b("MatMul",a,void 0)},925572:(a,l,h,f)=>{e.$b("ArgMax",a,{keepDims:!!l,selectLastIndex:!!h,axis:f})},925680:(a,l,h,f)=>{e.$b("ArgMin",a,{keepDims:!!l,selectLastIndex:!!h,axis:f})},925788:(a,l)=>{e.$b("Softmax",a,{axis:l})},925851:(a,l)=>{e.$b("Concat",a,{axis:l})},925911:(a,l,h,f,_)=>{e.$b("Split",a,{axis:l,numOutputs:h,splitSizes:f?Array.from((v(),D).subarray(Number(f)>>>0,Number(_)>>>0)):[]})},926067:a=>{e.$b("Expand",a,void 0)},926121:(a,l)=>{e.$b("Gather",a,{axis:Number(l)})},926192:(a,l)=>{e.$b("GatherElements",a,{axis:Number(l)})},926271:(a,l)=>{e.$b("GatherND",a,{batch_dims:Number(l)})},926350:(a,l,h,f,_,C,P,B,G,H,ue)=>{e.$b("Resize",a,{antialias:l,axes:h?Array.from((v(),D).subarray(Number(h)>>>0,Number(f)>>>0)):[],coordinateTransformMode:Ae(_),cubicCoeffA:C,excludeOutside:P,extrapolationValue:B,keepAspectRatioPolicy:Ae(G),mode:Ae(H),nearestMode:Ae(ue)})},926712:(a,l,h,f,_,C,P)=>{e.$b("Slice",a,{starts:l?Array.from((v(),D).subarray(Number(l)>>>0,Number(h)>>>0)):[],ends:f?Array.from((v(),D).subarray(Number(f)>>>0,Number(_)>>>0)):[],axes:C?Array.from((v(),D).subarray(Number(C)>>>0,Number(P)>>>0)):[]})},926976:a=>{e.$b("Tile",a,void 0)},927028:(a,l,h)=>{e.$b("InstanceNormalization",a,{epsilon:l,format:h?"NHWC":"NCHW"})},927142:(a,l,h)=>{e.$b("InstanceNormalization",a,{epsilon:l,format:h?"NHWC":"NCHW"})},927256:a=>{e.$b("Range",a,void 0)},927309:(a,l)=>{e.$b("Einsum",a,{equation:Ae(l)})},927390:(a,l,h,f,_)=>{e.$b("Pad",a,{mode:l,value:h,pads:f?Array.from((v(),D).subarray(Number(f)>>>0,Number(_)>>>0)):[]})},927533:(a,l,h,f,_,C)=>{e.$b("BatchNormalization",a,{epsilon:l,momentum:h,spatial:!!_,trainingMode:!!f,format:C?"NHWC":"NCHW"})},927702:(a,l,h,f,_,C)=>{e.$b("BatchNormalization",a,{epsilon:l,momentum:h,spatial:!!_,trainingMode:!!f,format:C?"NHWC":"NCHW"})},927871:(a,l,h)=>{e.$b("CumSum",a,{exclusive:Number(l),reverse:Number(h)})},927968:(a,l,h)=>{e.$b("DequantizeLinear",a,{axis:l,blockSize:h})},928058:(a,l,h,f,_)=>{e.$b("GridSample",a,{align_corners:l,mode:Ae(h),padding_mode:Ae(f),format:_?"NHWC":"NCHW"})},928228:(a,l,h,f,_)=>{e.$b("GridSample",a,{align_corners:l,mode:Ae(h),padding_mode:Ae(f),format:_?"NHWC":"NCHW"})},928398:(a,l)=>{e.$b("ScatterND",a,{reduction:Ae(l)})},928483:(a,l,h,f,_,C,P,B,G)=>{e.$b("Attention",a,{numHeads:l,isUnidirectional:h,maskFilterValue:f,scale:_,doRotary:C,qkvHiddenSizes:P?Array.from((v(),D).subarray(Number(B)>>>0,Number(B)+P>>>0)):[],pastPresentShareBuffer:!!G})},928755:a=>{e.$b("BiasAdd",a,void 0)},928810:a=>{e.$b("BiasSplitGelu",a,void 0)},928871:a=>{e.$b("FastGelu",a,void 0)},928927:(a,l,h,f,_,C,P,B,G,H,ue,pe,_e,xe,yt,Nn)=>{e.$b("Conv",a,{format:pe?"NHWC":"NCHW",auto_pad:l,dilations:h?Array.from((v(),D).subarray(Number(h)>>>0,Number(f)>>>0)):[],group:_,kernel_shape:C?Array.from((v(),D).subarray(Number(C)>>>0,Number(P)>>>0)):[],pads:B?Array.from((v(),D).subarray(Number(B)>>>0,Number(G)>>>0)):[],strides:H?Array.from((v(),D).subarray(Number(H)>>>0,Number(ue)>>>0)):[],w_is_const:()=>!!(v(),N)[Number(_e)>>>0],activation:Ae(xe),activation_params:yt?Array.from((v(),j).subarray(Number(yt)>>>0,Number(Nn)>>>0)):[]})},929511:a=>{e.$b("Gelu",a,void 0)},929563:(a,l,h,f,_,C,P,B,G)=>{e.$b("GroupQueryAttention",a,{numHeads:l,kvNumHeads:h,scale:f,softcap:_,doRotary:C,rotaryInterleaved:P,smoothSoftmax:B,localWindowSize:G})},929780:(a,l,h,f)=>{e.$b("LayerNormalization",a,{axis:l,epsilon:h,simplified:!!f})},929891:(a,l,h,f)=>{e.$b("LayerNormalization",a,{axis:l,epsilon:h,simplified:!!f})},930002:(a,l,h,f,_,C)=>{e.$b("MatMulNBits",a,{k:l,n:h,accuracyLevel:f,bits:_,blockSize:C})},930129:(a,l,h,f,_,C)=>{e.$b("MultiHeadAttention",a,{numHeads:l,isUnidirectional:h,maskFilterValue:f,scale:_,doRotary:C})},930288:(a,l)=>{e.$b("QuickGelu",a,{alpha:l})},930352:(a,l,h,f,_)=>{e.$b("RotaryEmbedding",a,{interleaved:!!l,numHeads:h,rotaryEmbeddingDim:f,scale:_})},930491:(a,l,h)=>{e.$b("SkipLayerNormalization",a,{epsilon:l,simplified:!!h})},930593:(a,l,h)=>{e.$b("SkipLayerNormalization",a,{epsilon:l,simplified:!!h})},930695:(a,l,h,f)=>{e.$b("GatherBlockQuantized",a,{gatherAxis:l,quantizeAxis:h,blockSize:f})},930816:a=>{e.Ed(a)},930850:(a,l)=>e.Gd(Number(a),Number(l),e.Xc.Jd,e.Xc.errors)};function Im(a,l,h){return bi(async()=>{await e.Cd(Number(a),Number(l),Number(h))})}function Cm(){return typeof wasmOffsetConverter<"u"}function Am(a,l,h,f){var _=le();try{return Yi(a,l,h,f)}catch(C){if(de(_),C!==C+0)throw C;ce(1,0)}}function Em(a,l,h){var f=le();try{return Qi(a,l,h)}catch(_){if(de(f),_!==_+0)throw _;ce(1,0)}}function km(a,l,h){var f=le();try{qi(a,l,h)}catch(_){if(de(f),_!==_+0)throw _;ce(1,0)}}function Pm(a,l){var h=le();try{return Rn(a,l)}catch(f){if(de(h),f!==f+0)throw f;ce(1,0)}}function Om(a){var l=le();try{Ki(a)}catch(h){if(de(l),h!==h+0)throw h;ce(1,0)}}function zm(a,l,h,f,_,C,P){var B=le();try{return Ji(a,l,h,f,_,C,P)}catch(G){if(de(B),G!==G+0)throw G;ce(1,0)}}function Dm(a,l){var h=le();try{ta(a,l)}catch(f){if(de(h),f!==f+0)throw f;ce(1,0)}}function Bm(a,l,h,f){var _=le();try{ea(a,l,h,f)}catch(C){if(de(_),C!==C+0)throw C;ce(1,0)}}function Mm(a,l,h,f,_){var C=le();try{Zi(a,l,h,f,_)}catch(P){if(de(C),P!==P+0)throw P;ce(1,0)}}function Rm(a,l,h,f,_,C,P){var B=le();try{na(a,l,h,f,_,C,P)}catch(G){if(de(B),G!==G+0)throw G;ce(1,0)}}function Um(a,l,h,f,_,C,P){var B=le();try{oa(a,l,h,f,_,C,P)}catch(G){if(de(B),G!==G+0)throw G;ce(1,0)}}function Nm(a,l,h,f,_,C,P,B){var G=le();try{aa(a,l,h,f,_,C,P,B)}catch(H){if(de(G),H!==H+0)throw H;ce(1,0)}}function Vm(a,l,h,f,_,C){var P=le();try{ji(a,l,h,f,_,C)}catch(B){if(de(P),B!==B+0)throw B;ce(1,0)}}function Lm(a,l,h,f,_){var C=le();try{return ra(a,l,h,f,_)}catch(P){if(de(C),P!==P+0)throw P;ce(1,0)}}function Wm(a,l,h,f,_,C,P,B){var G=le();try{sa(a,l,h,f,_,C,P,B)}catch(H){if(de(G),H!==H+0)throw H;ce(1,0)}}function Gm(a,l,h,f,_,C,P,B,G,H,ue,pe){var _e=le();try{ia(a,l,h,f,_,C,P,B,G,H,ue,pe)}catch(xe){if(de(_e),xe!==xe+0)throw xe;ce(1,0)}}function Hm(a,l,h,f,_,C){var P=le();try{return ua(a,l,h,f,_,C)}catch(B){if(de(P),B!==B+0)throw B;ce(1,0)}}function Fm(a,l,h){var f=le();try{return da(a,l,h)}catch(_){if(de(f),_!==_+0)throw _;return ce(1,0),0n}}function qm(a,l,h,f,_,C,P,B,G){var H=le();try{Xi(a,l,h,f,_,C,P,B,G)}catch(ue){if(de(H),ue!==ue+0)throw ue;ce(1,0)}}function Km(a){var l=le();try{return la(a)}catch(h){if(de(l),h!==h+0)throw h;ce(1,0)}}function jm(a,l){var h=le();try{return Ca(a,l)}catch(f){if(de(h),f!==f+0)throw f;return ce(1,0),0n}}function Zm(a){var l=le();try{return pa(a)}catch(h){if(de(l),h!==h+0)throw h;return ce(1,0),0n}}function Qm(a,l,h,f,_,C){var P=le();try{return ya(a,l,h,f,_,C)}catch(B){if(de(P),B!==B+0)throw B;ce(1,0)}}function Ym(a,l,h,f,_,C){var P=le();try{return wa(a,l,h,f,_,C)}catch(B){if(de(P),B!==B+0)throw B;ce(1,0)}}function Xm(a,l,h){var f=le();try{return _a(a,l,h)}catch(_){if(de(f),_!==_+0)throw _;ce(1,0)}}function Jm(a,l,h,f,_,C,P,B){var G=le();try{return ca(a,l,h,f,_,C,P,B)}catch(H){if(de(G),H!==H+0)throw H;ce(1,0)}}function ef(a,l,h,f,_){var C=le();try{return va(a,l,h,f,_)}catch(P){if(de(C),P!==P+0)throw P;return ce(1,0),0n}}function tf(a,l,h,f){var _=le();try{return $a(a,l,h,f)}catch(C){if(de(_),C!==C+0)throw C;ce(1,0)}}function rf(a,l,h,f){var _=le();try{return xa(a,l,h,f)}catch(C){if(de(_),C!==C+0)throw C;ce(1,0)}}function nf(a,l,h,f,_,C,P,B,G,H,ue,pe){var _e=le();try{return Sa(a,l,h,f,_,C,P,B,G,H,ue,pe)}catch(xe){if(de(_e),xe!==xe+0)throw xe;ce(1,0)}}function of(a,l,h,f,_,C,P,B,G,H,ue){var pe=le();try{ga(a,l,h,f,_,C,P,B,G,H,ue)}catch(_e){if(de(pe),_e!==_e+0)throw _e;ce(1,0)}}function af(a,l,h,f,_,C,P,B,G,H,ue,pe,_e,xe,yt,Nn){var pf=le();try{ba(a,l,h,f,_,C,P,B,G,H,ue,pe,_e,xe,yt,Nn)}catch(Vn){if(de(pf),Vn!==Vn+0)throw Vn;ce(1,0)}}function sf(a,l,h,f){var _=le();try{return Ta(a,l,h,f)}catch(C){if(de(_),C!==C+0)throw C;ce(1,0)}}function uf(a,l,h,f,_){var C=le();try{return Ia(a,l,h,f,_)}catch(P){if(de(C),P!==P+0)throw P;ce(1,0)}}function df(a,l,h){var f=le();try{return ma(a,l,h)}catch(_){if(de(f),_!==_+0)throw _;ce(1,0)}}function lf(a,l,h){var f=le();try{return fa(a,l,h)}catch(_){if(de(f),_!==_+0)throw _;ce(1,0)}}function cf(a,l,h,f){var _=le();try{ha(a,l,h,f)}catch(C){if(de(_),C!==C+0)throw C;ce(1,0)}}function $r(){if(0<Ce)$e=$r;else if(o)w?.(e),re();else{for(var a=Xe;0<a.length;)a.shift()(e);0<Ce?$e=$r:(e.calledRun=!0,A||(re(),w?.(e)))}}return o||(ct=await Se(),$r()),e.PTR_SIZE=4,we?e:new Promise((a,l)=>{w=a,S=l})}var _f,vf,ms=V(()=>{"use strict";_f=cs,vf=globalThis.self?.name?.startsWith("em-pthread");vf&&cs()});var gs,Yn,$f,Le,bs,Qn,xf,Sf,ys,Tf,fs,ws,hs,_s,Ar=V(()=>{"use strict";Cr();gs=typeof location>"u"?void 0:location.origin,Yn=import.meta.url>"file:"&&import.meta.url<"file;",$f=()=>{if(!!1){if(Yn){let t=URL;return new URL(new t("ort.bundle.min.mjs",import.meta.url).href,gs).href}return import.meta.url}},Le=$f(),bs=()=>{if(Le&&!Le.startsWith("blob:"))return Le.substring(0,Le.lastIndexOf("/")+1)},Qn=(t,e)=>{try{let r=e??Le;return(r?new URL(t,r):new URL(t)).origin===gs}catch{return!1}},xf=(t,e)=>{let r=e??Le;try{return(r?new URL(t,r):new URL(t)).href}catch{return}},Sf=(t,e)=>`${e??"./"}${t}`,ys=async t=>{let r=await(await fetch(t,{credentials:"same-origin"})).blob();return URL.createObjectURL(r)},Tf=async t=>(await import(/*webpackIgnore:true*/ /*@vite-ignore*/t)).default,fs=(ls(),Yt(ds)).default,ws=async()=>{if(!Le)throw new Error("Failed to load proxy worker: cannot determine the script source URL.");if(Qn(Le))return[void 0,fs()];let t=await ys(Le);return[t,fs(t)]},hs=(ms(),Yt(ps)).default,_s=async(t,e,r,n)=>{let o=hs&&!(t||e);if(o)if(Le)o=Qn(Le);else if(n&&!r)o=!0;else throw new Error("cannot determine the script source URL.");if(o)return[void 0,hs];{let i="ort-wasm-simd-threaded.jsep.mjs",s=t??xf(i,e),u=!!1&&r&&s&&!Qn(s,e),d=u?await ys(s):s??Sf(i,e);return[u?d:void 0,await Tf(d)]}}});var Xn,Jn,Rr,vs,If,Cf,Af,Er,ge,vt=V(()=>{"use strict";Ar();Jn=!1,Rr=!1,vs=!1,If=()=>{if(typeof SharedArrayBuffer>"u")return!1;try{return typeof MessageChannel<"u"&&new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)),WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,5,4,1,3,1,1,10,11,1,9,0,65,0,254,16,2,0,26,11]))}catch{return!1}},Cf=()=>{try{return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,30,1,28,0,65,0,253,15,253,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,253,186,1,26,11]))}catch{return!1}},Af=()=>{try{return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,19,1,17,0,65,1,253,15,65,2,253,15,65,3,253,15,253,147,2,11]))}catch{return!1}},Er=async t=>{if(Jn)return Promise.resolve();if(Rr)throw new Error("multiple calls to 'initializeWebAssembly()' detected.");if(vs)throw new Error("previous call to 'initializeWebAssembly()' failed.");Rr=!0;let e=t.initTimeout,r=t.numThreads;if(t.simd!==!1){if(t.simd==="relaxed"){if(!Af())throw new Error("Relaxed WebAssembly SIMD is not supported in the current environment.")}else if(!Cf())throw new Error("WebAssembly SIMD is not supported in the current environment.")}let n=If();r>1&&!n&&(typeof self<"u"&&!self.crossOriginIsolated&&console.warn("env.wasm.numThreads is set to "+r+", but this will not work unless you enable crossOriginIsolated mode. See https://web.dev/cross-origin-isolation-guide/ for more info."),console.warn("WebAssembly multi-threading is not supported in the current environment. Falling back to single-threading."),t.numThreads=r=1);let o=t.wasmPaths,i=typeof o=="string"?o:void 0,s=o?.mjs,u=s?.href??s,d=o?.wasm,c=d?.href??d,p=t.wasmBinary,[m,g]=await _s(u,i,r>1,!!p||!!c),y=!1,b=[];if(e>0&&b.push(new Promise(w=>{setTimeout(()=>{y=!0,w()},e)})),b.push(new Promise((w,S)=>{let x={numThreads:r};if(p)x.wasmBinary=p;else if(c||i)x.locateFile=$=>c??i+$;else if(u&&u.indexOf("blob:")!==0)x.locateFile=$=>new URL($,u).href;else if(m){let $=bs();$&&(x.locateFile=T=>$+T)}g(x).then($=>{Rr=!1,Jn=!0,Xn=$,w(),m&&URL.revokeObjectURL(m)},$=>{Rr=!1,vs=!0,S($)})})),await Promise.race(b),y)throw new Error(`WebAssembly backend initializing failed due to timeout: ${e}ms`)},ge=()=>{if(Jn&&Xn)return Xn;throw new Error("WebAssembly is not initialized yet.")}});var We,er,me,Ur=V(()=>{"use strict";vt();We=(t,e)=>{let r=ge(),n=r.lengthBytesUTF8(t)+1,o=r._malloc(n);return r.stringToUTF8(t,o,n),e.push(o),o},er=(t,e,r,n)=>{if(typeof t=="object"&&t!==null){if(r.has(t))throw new Error("Circular reference in options");r.add(t)}Object.entries(t).forEach(([o,i])=>{let s=e?e+o:o;if(typeof i=="object")er(i,s+".",r,n);else if(typeof i=="string"||typeof i=="number")n(s,i.toString());else if(typeof i=="boolean")n(s,i?"1":"0");else throw new Error(`Can't handle extra config type: ${typeof i}`)})},me=t=>{let e=ge(),r=e.stackSave();try{let n=e.PTR_SIZE,o=e.stackAlloc(2*n);e._OrtGetLastError(o,o+n);let i=Number(e.getValue(o,n===4?"i32":"i64")),s=e.getValue(o+n,"*"),u=s?e.UTF8ToString(s):"";throw new Error(`${t} ERROR_CODE: ${i}, ERROR_MESSAGE: ${u}`)}finally{e.stackRestore(r)}}});var $s,xs=V(()=>{"use strict";vt();Ur();$s=t=>{let e=ge(),r=0,n=[],o=t||{};try{if(t?.logSeverityLevel===void 0)o.logSeverityLevel=2;else if(typeof t.logSeverityLevel!="number"||!Number.isInteger(t.logSeverityLevel)||t.logSeverityLevel<0||t.logSeverityLevel>4)throw new Error(`log severity level is not valid: ${t.logSeverityLevel}`);if(t?.logVerbosityLevel===void 0)o.logVerbosityLevel=0;else if(typeof t.logVerbosityLevel!="number"||!Number.isInteger(t.logVerbosityLevel))throw new Error(`log verbosity level is not valid: ${t.logVerbosityLevel}`);t?.terminate===void 0&&(o.terminate=!1);let i=0;return t?.tag!==void 0&&(i=We(t.tag,n)),r=e._OrtCreateRunOptions(o.logSeverityLevel,o.logVerbosityLevel,!!o.terminate,i),r===0&&me("Can't create run options."),t?.extra!==void 0&&er(t.extra,"",new WeakSet,(s,u)=>{let d=We(s,n),c=We(u,n);e._OrtAddRunConfigEntry(r,d,c)!==0&&me(`Can't set a run config entry: ${s} - ${u}.`)}),[r,n]}catch(i){throw r!==0&&e._OrtReleaseRunOptions(r),n.forEach(s=>e._free(s)),i}}});var Ef,kf,Pf,Nr,Of,Ss,Ts=V(()=>{"use strict";vt();Ur();Ef=t=>{switch(t){case"disabled":return 0;case"basic":return 1;case"extended":return 2;case"layout":return 3;case"all":return 99;default:throw new Error(`unsupported graph optimization level: ${t}`)}},kf=t=>{switch(t){case"sequential":return 0;case"parallel":return 1;default:throw new Error(`unsupported execution mode: ${t}`)}},Pf=t=>{t.extra||(t.extra={}),t.extra.session||(t.extra.session={});let e=t.extra.session;e.use_ort_model_bytes_directly||(e.use_ort_model_bytes_directly="1"),t.executionProviders&&t.executionProviders.some(r=>(typeof r=="string"?r:r.name)==="webgpu")&&(t.enableMemPattern=!1)},Nr=(t,e,r,n)=>{let o=We(e,n),i=We(r,n);ge()._OrtAddSessionConfigEntry(t,o,i)!==0&&me(`Can't set a session config entry: ${e} - ${r}.`)},Of=async(t,e,r)=>{let n=e.executionProviders;for(let o of n){let i=typeof o=="string"?o:o.name,s=[];switch(i){case"webnn":if(i="WEBNN",typeof o!="string"){let g=o?.deviceType;g&&Nr(t,"deviceType",g,r)}break;case"webgpu":if(i="JS",typeof o!="string"){let m=o;if(m?.preferredLayout){if(m.preferredLayout!=="NCHW"&&m.preferredLayout!=="NHWC")throw new Error(`preferredLayout must be either 'NCHW' or 'NHWC': ${m.preferredLayout}`);Nr(t,"preferredLayout",m.preferredLayout,r)}}break;case"wasm":case"cpu":continue;default:throw new Error(`not supported execution provider: ${i}`)}let u=We(i,r),d=s.length,c=0,p=0;if(d>0){c=ge()._malloc(d*ge().PTR_SIZE),r.push(c),p=ge()._malloc(d*ge().PTR_SIZE),r.push(p);for(let m=0;m<d;m++)ge().setValue(c+m*ge().PTR_SIZE,s[m][0],"*"),ge().setValue(p+m*ge().PTR_SIZE,s[m][1],"*")}await ge()._OrtAppendExecutionProvider(t,u,c,p,d)!==0&&me(`Can't append execution provider: ${i}.`)}},Ss=async t=>{let e=ge(),r=0,n=[],o=t||{};Pf(o);try{let i=Ef(o.graphOptimizationLevel??"all"),s=kf(o.executionMode??"sequential"),u=typeof o.logId=="string"?We(o.logId,n):0,d=o.logSeverityLevel??2;if(!Number.isInteger(d)||d<0||d>4)throw new Error(`log severity level is not valid: ${d}`);let c=o.logVerbosityLevel??0;if(!Number.isInteger(c)||c<0||c>4)throw new Error(`log verbosity level is not valid: ${c}`);let p=typeof o.optimizedModelFilePath=="string"?We(o.optimizedModelFilePath,n):0;if(r=e._OrtCreateSessionOptions(i,!!o.enableCpuMemArena,!!o.enableMemPattern,s,!!o.enableProfiling,0,u,d,c,p),r===0&&me("Can't create session options."),o.executionProviders&&await Of(r,o,n),o.enableGraphCapture!==void 0){if(typeof o.enableGraphCapture!="boolean")throw new Error(`enableGraphCapture must be a boolean value: ${o.enableGraphCapture}`);Nr(r,"enableGraphCapture",o.enableGraphCapture.toString(),n)}if(o.freeDimensionOverrides)for(let[m,g]of Object.entries(o.freeDimensionOverrides)){if(typeof m!="string")throw new Error(`free dimension override name must be a string: ${m}`);if(typeof g!="number"||!Number.isInteger(g)||g<0)throw new Error(`free dimension override value must be a non-negative integer: ${g}`);let y=We(m,n);e._OrtAddFreeDimensionOverride(r,y,g)!==0&&me(`Can't set a free dimension override: ${m} - ${g}.`)}return o.extra!==void 0&&er(o.extra,"",new WeakSet,(m,g)=>{Nr(r,m,g,n)}),[r,n]}catch(i){throw r!==0&&e._OrtReleaseSessionOptions(r)!==0&&me("Can't release session options."),n.forEach(s=>e._free(s)),i}}});var $t,rt,xt,Lt,tr,Vr,Lr,eo,J=V(()=>{"use strict";$t=t=>{switch(t){case"int8":return 3;case"uint8":return 2;case"bool":return 9;case"int16":return 5;case"uint16":return 4;case"int32":return 6;case"uint32":return 12;case"float16":return 10;case"float32":return 1;case"float64":return 11;case"string":return 8;case"int64":return 7;case"uint64":return 13;case"int4":return 22;case"uint4":return 21;default:throw new Error(`unsupported data type: ${t}`)}},rt=t=>{switch(t){case 3:return"int8";case 2:return"uint8";case 9:return"bool";case 5:return"int16";case 4:return"uint16";case 6:return"int32";case 12:return"uint32";case 10:return"float16";case 1:return"float32";case 11:return"float64";case 8:return"string";case 7:return"int64";case 13:return"uint64";case 22:return"int4";case 21:return"uint4";default:throw new Error(`unsupported data type: ${t}`)}},xt=(t,e)=>{let r=[-1,4,1,1,2,2,4,8,-1,1,2,8,4,8,-1,-1,-1,-1,-1,-1,-1,.5,.5][t],n=typeof e=="number"?e:e.reduce((o,i)=>o*i,1);return r>0?Math.ceil(n*r):void 0},Lt=t=>{switch(t){case"float16":return typeof Float16Array<"u"&&Float16Array.from?Float16Array:Uint16Array;case"float32":return Float32Array;case"uint8":return Uint8Array;case"int8":return Int8Array;case"uint16":return Uint16Array;case"int16":return Int16Array;case"int32":return Int32Array;case"bool":return Uint8Array;case"float64":return Float64Array;case"uint32":return Uint32Array;case"int64":return BigInt64Array;case"uint64":return BigUint64Array;default:throw new Error(`unsupported type: ${t}`)}},tr=t=>{switch(t){case"verbose":return 0;case"info":return 1;case"warning":return 2;case"error":return 3;case"fatal":return 4;default:throw new Error(`unsupported logging level: ${t}`)}},Vr=t=>t==="float32"||t==="float16"||t==="int32"||t==="int64"||t==="uint32"||t==="uint8"||t==="bool"||t==="uint4"||t==="int4",Lr=t=>t==="float32"||t==="float16"||t==="int32"||t==="int64"||t==="uint32"||t==="uint64"||t==="int8"||t==="uint8"||t==="bool"||t==="uint4"||t==="int4",eo=t=>{switch(t){case"none":return 0;case"cpu":return 1;case"cpu-pinned":return 2;case"texture":return 3;case"gpu-buffer":return 4;case"ml-tensor":return 5;default:throw new Error(`unsupported data location: ${t}`)}}});var rr,to=V(()=>{"use strict";Cr();rr=async t=>{if(typeof t=="string")if(!1)try{let{readFile:e}=Wn("node:fs/promises");return new Uint8Array(await e(t))}catch(e){if(e.code==="ERR_FS_FILE_TOO_LARGE"){let{createReadStream:r}=Wn("node:fs"),n=r(t),o=[];for await(let i of n)o.push(i);return new Uint8Array(Buffer.concat(o))}throw e}else{let e=await fetch(t);if(!e.ok)throw new Error(`failed to load external data file: ${t}`);let r=e.headers.get("Content-Length"),n=r?parseInt(r,10):0;if(n<1073741824)return new Uint8Array(await e.arrayBuffer());{if(!e.body)throw new Error(`failed to load external data file: ${t}, no response body.`);let o=e.body.getReader(),i;try{i=new ArrayBuffer(n)}catch(u){if(u instanceof RangeError){let d=Math.ceil(n/65536);i=new WebAssembly.Memory({initial:d,maximum:d}).buffer}else throw u}let s=0;for(;;){let{done:u,value:d}=await o.read();if(u)break;let c=d.byteLength;new Uint8Array(i,s,c).set(d),s+=c}return new Uint8Array(i,0,n)}}else return t instanceof Blob?new Uint8Array(await t.arrayBuffer()):t instanceof Uint8Array?t:new Uint8Array(t)}});var zf,Df,Is,Cs,Wr,Bf,se,nt=V(()=>{"use strict";J();zf=["V","I","W","E","F"],Df=(t,e)=>{console.log(`[${zf[t]},${new Date().toISOString()}]${e}`)},Wr=(t,e)=>{Is=t,Cs=e},Bf=(t,e)=>{let r=tr(t),n=tr(Is);r>=n&&Df(r,typeof e=="function"?e():e)},se=(...t)=>{Cs&&Bf(...t)}});var ro,ot,k,zt,Gr,As,Es,ne=V(()=>{"use strict";ro=class{static calcMatMulShape(e,r){return e[1]!==r[0]?void 0:[e[0],r[1]]}},ot=class{static calcShape(e,r,n=!1){let o=e.length,i=r.length;if(o===0)return r;if(i===0)return e;let s=Math.max(e.length,r.length),u=new Array(s);if(n){if(o<2||i<2)return;let d=ro.calcMatMulShape([e[o-2],e[o-1]],[r[i-2],r[i-1]]);if(d===void 0)return;[u[s-2],u[s-1]]=d}for(let d=n?3:1;d<=s;d++){let c=o-d<0?1:e[o-d],p=i-d<0?1:r[i-d];if(c!==p&&c>1&&p>1)return;let m=Math.max(c,p);if(c&&p)u[s-d]=Math.max(c,p);else{if(m>1)return;u[s-d]=0}}return u}static isValidBroadcast(e,r){let n=e.length,o=r.length;if(n>o)return!1;for(let i=1;i<=n;i++)if(e[n-i]!==1&&e[n-i]!==r[o-i])return!1;return!0}},k=class t{static size(e){return t.getSizeFromDimensionRange(e,0,e.length)}static convertShape(e,r=4){let n=e.length;if(n===0)return[];let o=new Array(n),i=n-1;for(;i>=0;){if(e[i]%r===0){o[i]=e[i]/r;break}if(r%e[i]!==0)throw new Error("cannot convert shape");o[i]=1,r/=e[i],i--}for(i--;i>=0;i--)o[i]=e[i];return o}static sizeFromDimension(e,r){if(r<0||r>e.length)throw new Error(`invalid dimension of ${r} for sizeFromDimension as Tensor has ${e.length} dimensions.`);return t.getSizeFromDimensionRange(e,r,e.length)}static sizeToDimension(e,r){if(r<0||r>e.length)throw new Error(`invalid dimension of ${r} for sizeToDimension as Tensor has ${e.length} dimensions.`);return t.getSizeFromDimensionRange(e,0,r)}static getSizeFromDimensionRange(e,r,n){let o=1;for(let i=r;i<n;i++){if(e[i]<0)throw new Error("cannot get valid size from specified dimension range. Most likely the range contains negative values in them.");o*=Number(e[i])}return o}static computeStrides(e){let r=e.length;if(r===0)return[];if(r===1)return[1];let n=new Array(r);n[r-1]=1,n[r-2]=e[r-1];for(let o=r-3;o>=0;--o)n[o]=n[o+1]*e[o+1];return n}static normalizeAxis(e,r){if(e<-r&&e>=r)throw new Error("unsupported axis for this operation.");return e<0?e+r:e}static normalizeAxes(e,r){return e.map(n=>this.normalizeAxis(n,r??e.length))}static sortBasedOnPerm(e,r){return r?r.map(n=>e[n]):e.slice().reverse()}static padShape(e,r){let n=e.length;return e.map((o,i)=>o+r[i]+r[i+n])}static areEqual(e,r){return e.length!==r.length?!1:e.every((n,o)=>n===r[o])}},zt=class t{static adjustPoolAttributes(e,r,n,o,i,s){if(!e&&n.length!==r.length-2)throw new Error("length of specified kernel shapes should be 2 less than length of input dimensions");if(e)for(let u=0;u<r.length-2;u++)u>=n.length?n.push(r[u+2]):n[u]=r[u+2];for(let u=0;u<n.length;u++)if(u<o.length){if(o[u]<0)throw new Error("strides should be greater than or equal to 1")}else o.push(1);for(let u=0;u<n.length;u++)if(u<i.length){if(i[u]<0)throw new Error("dilations should be greater than or equal to 1")}else i.push(1);for(let u=0;u<n.length*2;u++)if(u<s.length){if(s[u]<0)throw new Error("pad should be greater than or equal to 1")}else s.push(0);for(let u=0;u<n.length;u++){if(n[u]<=0)throw new Error("kernel shapes need to be greater than 0");if(s[u]>=n[u]||s[u+n.length]>=n[u])throw new Error("pads should be smaller than kernel")}}static adjustPadsBasedOnAutoPad(e,r,n,o,i,s,u){if(u){if(i.length!==2*(e.length-2))throw new Error("length of pads should be twice the length of data dimensions");if(r.length!==e.length-2)throw new Error("length of strides should be the length of data dimensions");if(o.length!==e.length-2)throw new Error("length of kernel shapes should be the length of data dimensions");for(let d=0;d<e.length-2;d++)t.adjustPadAndReturnShape(e[d+(s?1:2)],r[d],n[d],o[d],i,d,d+e.length-2,u)}}static computePoolOutputShape(e,r,n,o,i,s,u){if(r.length<=0)throw new Error("input shape must be of size greater than 0");let d=[r[0],r[1]];return t.computeShapeHelper(e,r,d,n,o,i,s,u),d}static computeConvOutputShape(e,r,n,o,i,s,u){if(e.length<=0||r.length<=0)throw new Error("invalid input tensor dims or invalid filter tensor dims");let d=[e[0],r[0]];return t.computeShapeHelper(!1,e,d,n,o,i,s,u),d}static computeShapeHelper(e,r,n,o,i,s,u,d){if(e)for(let c=0;c<r.length-2;c++)n.push(1);else for(let c=0;c<r.length-2;c++)n.push(t.adjustPadAndReturnShape(r[c+2],o[c],i[c],s[c],u,c,c+r.length-2,d))}static adjustPadAndReturnShape(e,r,n,o,i,s,u,d){let c=n*(o-1)+1;if(d&&d!=="NOTSET")switch(d){case"VALID":return i[s]=0,i[u]=0,Math.floor((e-c)/r+1);case"SAME_LOWER":case"SAME_UPPER":if(n!==1)throw new Error("Dilation not supported for SAME_UPPER or SAME_LOWER");{let m=((e+r-1)/r-1)*r+o-e;return i[s]=Math.floor(d==="SAME_LOWER"?(m+1)/2:m/2),i[u]=m-i[s],Math.floor((e+m-o)/r+1)}default:throw new Error("Unsupported AutoPad type")}else return Math.floor((e+i[s]+i[u]-c)/r+1)}},Gr=class{static getShapeOfGemmResult(e,r,n,o,i){if(e.length!==2||n.length!==2)throw new Error("shape need to be of size 2");let s,u,d;r?(s=e[1],u=e[0]):(s=e[0],u=e[1]);let c=-1;if(o?(d=n[0],c=1):(d=n[1],c=0),n[c]!==u)throw new Error("dimension mismatch");if(s<=0||d<=0||u<=0)throw new Error("invalid shape specified");if(i&&!ot.isValidBroadcast(i,[s,d]))throw new Error("gemm: invalid bias shape for broadcast");return[s,d,u]}},As=-34028234663852886e22,Es=34028234663852886e22});var Hr,no=V(()=>{"use strict";J();Hr=(t,e)=>new(Lt(e))(t)});var Ps,io,Os,Mf,ks,Rf,zs,Fr,qr,oo,Ds,Bs=V(()=>{"use strict";J();nt();Ps=new Map([["float32",32],["float16",16],["int32",32],["uint32",32],["int64",64],["uint64",64],["int8",8],["uint8",8],["int4",4],["uint4",4]]),io=(t,e)=>{if(e==="int32")return t;let r=Ps.get(e);if(!r)throw new Error(`WebNN backend does not support data type: ${e}`);let n=r/8;if(t.byteLength%n!==0)throw new Error(`Invalid Uint8Array length - must be a multiple of ${n}.`);let o=t.byteLength/n,i=new(Lt(e))(t.buffer,t.byteOffset,o);switch(e){case"int64":case"uint64":{let s=new Int32Array(o);for(let u=0;u<o;u++){let d=i[u];if(d>2147483647n||d<-2147483648n)throw new Error("Can not convert int64 data to int32 - value out of range.");s[u]=Number(d)}return new Uint8Array(s.buffer)}case"int8":case"uint8":case"uint32":{if(e==="uint32"&&i.some(u=>u>2147483647))throw new Error("Can not convert uint32 data to int32 - value out of range.");let s=Int32Array.from(i,Number);return new Uint8Array(s.buffer)}default:throw new Error(`Unsupported data conversion from ${e} to 'int32'`)}},Os=(t,e)=>{if(e==="int32")return t;if(t.byteLength%4!==0)throw new Error("Invalid Uint8Array length - must be a multiple of 4 (int32).");let r=t.byteLength/4,n=new Int32Array(t.buffer,t.byteOffset,r);switch(e){case"int64":{let o=BigInt64Array.from(n,BigInt);return new Uint8Array(o.buffer)}case"uint64":{if(n.some(i=>i<0))throw new Error("Can not convert int32 data to uin64 - negative value found.");let o=BigUint64Array.from(n,BigInt);return new Uint8Array(o.buffer)}case"int8":{if(n.some(i=>i<-128||i>127))throw new Error("Can not convert int32 data to int8 - value out of range.");let o=Int8Array.from(n,Number);return new Uint8Array(o.buffer)}case"uint8":{if(n.some(o=>o<0||o>255))throw new Error("Can not convert int32 data to uint8 - value out of range.");return Uint8Array.from(n,Number)}case"uint32":{if(n.some(i=>i<0))throw new Error("Can not convert int32 data to uint32 - negative value found.");let o=Uint32Array.from(n,Number);return new Uint8Array(o.buffer)}default:throw new Error(`Unsupported data conversion from 'int32' to ${e}`)}},Mf=1,ks=()=>Mf++,Rf=new Map([["int8","int32"],["uint8","int32"],["uint32","int32"],["int64","int32"]]),zs=(t,e)=>{let r=Ps.get(t);if(!r)throw new Error(`WebNN backend does not support data type: ${t}`);return e.length>0?Math.ceil(e.reduce((n,o)=>n*o)*r/8):0},Fr=class{constructor(e){this.isDataConverted=!1;let{sessionId:r,context:n,tensor:o,dataType:i,shape:s,fallbackDataType:u}=e;this.sessionId=r,this.mlContext=n,this.mlTensor=o,this.dataType=i,this.tensorShape=s,this.fallbackDataType=u}get tensor(){return this.mlTensor}get type(){return this.dataType}get fallbackType(){return this.fallbackDataType}get shape(){return this.tensorShape}get byteLength(){return zs(this.dataType,this.tensorShape)}destroy(){se("verbose",()=>"[WebNN] TensorWrapper.destroy"),this.mlTensor.destroy()}write(e){this.mlContext.writeTensor(this.mlTensor,e)}async read(e){if(this.fallbackDataType){let r=await this.mlContext.readTensor(this.mlTensor),n=Os(new Uint8Array(r),this.dataType);if(e){(e instanceof ArrayBuffer?new Uint8Array(e):new Uint8Array(e.buffer,e.byteOffset,e.byteLength)).set(n);return}else return n.buffer}else return e?this.mlContext.readTensor(this.mlTensor,e):this.mlContext.readTensor(this.mlTensor)}canReuseTensor(e,r,n){return this.mlContext===e&&this.dataType===r&&this.tensorShape.length===n.length&&this.tensorShape.every((o,i)=>o===n[i])}setIsDataConverted(e){this.isDataConverted=e}},qr=class{constructor(e,r){this.tensorManager=e;this.wrapper=r}get tensorWrapper(){return this.wrapper}releaseTensor(){this.tensorWrapper&&(this.tensorManager.releaseTensor(this.tensorWrapper),this.wrapper=void 0)}async ensureTensor(e,r,n,o){let i=this.tensorManager.getMLContext(e),s=this.tensorManager.getMLOpSupportLimits(e),u;if(!s?.input.dataTypes.includes(r)){if(u=Rf.get(r),!u||s?.input.dataTypes.includes(u))throw new Error(`WebNN backend does not support data type: ${r}`);se("verbose",()=>`[WebNN] TensorIdTracker.ensureTensor: fallback dataType from ${r} to ${u}`)}if(this.wrapper){if(this.wrapper.canReuseTensor(i,r,n))return this.wrapper.tensor;if(o){if(this.wrapper.byteLength!==zs(r,n))throw new Error("Unable to copy data to tensor with different size.");this.activeUpload=new Uint8Array(await this.wrapper.read())}this.tensorManager.releaseTensor(this.wrapper)}let d=typeof MLTensorUsage>"u"?void 0:MLTensorUsage.READ|MLTensorUsage.WRITE;return this.wrapper=await this.tensorManager.getCachedTensor(e,r,n,d,!0,!0,u),o&&this.activeUpload&&(this.wrapper.write(this.activeUpload),this.activeUpload=void 0),this.wrapper.tensor}upload(e){let r=e;if(this.wrapper){if(this.wrapper.fallbackType)if(this.wrapper.fallbackType==="int32")r=io(e,this.wrapper.type),this.wrapper.setIsDataConverted(!0);else throw new Error(`Unsupported fallback data type: ${this.wrapper.fallbackType}`);if(e.byteLength===this.wrapper.byteLength){this.wrapper.write(r);return}else se("verbose",()=>"Data size does not match tensor size. Releasing tensor."),this.releaseTensor()}this.activeUpload?this.activeUpload.set(r):this.activeUpload=new Uint8Array(r)}async download(e){if(this.activeUpload){let r=this.wrapper?.isDataConverted?Os(this.activeUpload,this.wrapper?.type):this.activeUpload;if(e){e instanceof ArrayBuffer?new Uint8Array(e).set(r):new Uint8Array(e.buffer,e.byteOffset,e.byteLength).set(r);return}else return r.buffer}if(!this.wrapper)throw new Error("Tensor has not been created.");return e?this.wrapper.read(e):this.wrapper.read()}},oo=class{constructor(e){this.backend=e;this.tensorTrackersById=new Map;this.freeTensors=[];this.externalTensors=new Set}getMLContext(e){let r=this.backend.getMLContext(e);if(!r)throw new Error("MLContext not found for session.");return r}getMLOpSupportLimits(e){return this.backend.getMLOpSupportLimits(e)}reserveTensorId(){let e=ks();return this.tensorTrackersById.set(e,new qr(this)),e}releaseTensorId(e){let r=this.tensorTrackersById.get(e);r&&(this.tensorTrackersById.delete(e),r.tensorWrapper&&this.releaseTensor(r.tensorWrapper))}async ensureTensor(e,r,n,o,i){se("verbose",()=>`[WebNN] TensorManager.ensureTensor {tensorId: ${r}, dataType: ${n}, shape: ${o}, copyOld: ${i}}`);let s=this.tensorTrackersById.get(r);if(!s)throw new Error("Tensor not found.");return s.ensureTensor(e,n,o,i)}upload(e,r){let n=this.tensorTrackersById.get(e);if(!n)throw new Error("Tensor not found.");n.upload(r)}async download(e,r){se("verbose",()=>`[WebNN] TensorManager.download {tensorId: ${e}, dstBuffer: ${r?.byteLength}}`);let n=this.tensorTrackersById.get(e);if(!n)throw new Error("Tensor not found.");return n.download(r)}releaseTensorsForSession(e){for(let r of this.freeTensors)r.sessionId===e&&r.destroy();this.freeTensors=this.freeTensors.filter(r=>r.sessionId!==e)}registerTensor(e,r,n,o){let i=this.getMLContext(e),s=ks(),u=new Fr({sessionId:e,context:i,tensor:r,dataType:n,shape:o});return this.tensorTrackersById.set(s,new qr(this,u)),this.externalTensors.add(u),s}async getCachedTensor(e,r,n,o,i,s,u){let d=this.getMLContext(e);for(let[p,m]of this.freeTensors.entries())if(m.canReuseTensor(d,r,n)){se("verbose",()=>`[WebNN] Reusing tensor {dataType: ${r}, ${u?`fallbackDataType: ${u},`:""} shape: ${n}`);let g=this.freeTensors.splice(p,1)[0];return g.sessionId=e,g}se("verbose",()=>`[WebNN] MLContext.createTensor {dataType: ${r}, ${u?`fallbackDataType: ${u},`:""} shape: ${n}}`);let c=await d.createTensor({dataType:u??r,shape:n,dimensions:n,usage:o,writable:i,readable:s});return new Fr({sessionId:e,context:d,tensor:c,dataType:r,shape:n,fallbackDataType:u})}releaseTensor(e){this.externalTensors.has(e)&&this.externalTensors.delete(e),this.freeTensors.push(e)}},Ds=(...t)=>new oo(...t)});var Kr,Uf,jr,Ms=V(()=>{"use strict";J();vt();no();Bs();nt();Kr=new Map([[1,"float32"],[10,"float16"],[6,"int32"],[12,"uint32"],[7,"int64"],[13,"uint64"],[22,"int4"],[21,"uint4"],[3,"int8"],[2,"uint8"],[9,"uint8"]]),Uf=(t,e)=>{if(t===e)return!0;if(t===void 0||e===void 0)return!1;let r=Object.keys(t).sort(),n=Object.keys(e).sort();return r.length===n.length&&r.every((o,i)=>o===n[i]&&t[o]===e[o])},jr=class{constructor(e){this.tensorManager=Ds(this);this.mlContextBySessionId=new Map;this.sessionIdsByMLContext=new Map;this.mlContextCache=[];this.sessionGraphInputs=new Map;this.sessionGraphOutputs=new Map;this.temporaryGraphInputs=[];this.temporaryGraphOutputs=[];this.temporarySessionTensorIds=new Map;this.mlOpSupportLimitsBySessionId=new Map;Wr(e.logLevel,!!e.debug)}get currentSessionId(){if(this.activeSessionId===void 0)throw new Error("No active session");return this.activeSessionId}onRunStart(e){se("verbose",()=>`[WebNN] onRunStart {sessionId: ${e}}`),this.activeSessionId=e}onRunEnd(e){se("verbose",()=>`[WebNN] onRunEnd {sessionId: ${e}}`);let r=this.temporarySessionTensorIds.get(e);if(r){for(let n of r)se("verbose",()=>`[WebNN] releasing temporary tensor {tensorId: ${n}}`),this.tensorManager.releaseTensorId(n);this.temporarySessionTensorIds.delete(e),this.activeSessionId=void 0}}async createMLContext(e){if(e instanceof GPUDevice){let n=this.mlContextCache.findIndex(o=>o.gpuDevice===e);if(n!==-1)return this.mlContextCache[n].mlContext;{let o=await navigator.ml.createContext(e);return this.mlContextCache.push({gpuDevice:e,mlContext:o}),o}}else if(e===void 0){let n=this.mlContextCache.findIndex(o=>o.options===void 0&&o.gpuDevice===void 0);if(n!==-1)return this.mlContextCache[n].mlContext;{let o=await navigator.ml.createContext();return this.mlContextCache.push({mlContext:o}),o}}let r=this.mlContextCache.findIndex(n=>Uf(n.options,e));if(r!==-1)return this.mlContextCache[r].mlContext;{let n=await navigator.ml.createContext(e);return this.mlContextCache.push({options:e,mlContext:n}),n}}registerMLContext(e,r){this.mlContextBySessionId.set(e,r);let n=this.sessionIdsByMLContext.get(r);n||(n=new Set,this.sessionIdsByMLContext.set(r,n)),n.add(e),this.mlOpSupportLimitsBySessionId.has(e)||this.mlOpSupportLimitsBySessionId.set(e,r.opSupportLimits()),this.temporaryGraphInputs.length>0&&(this.sessionGraphInputs.set(e,this.temporaryGraphInputs),this.temporaryGraphInputs=[]),this.temporaryGraphOutputs.length>0&&(this.sessionGraphOutputs.set(e,this.temporaryGraphOutputs),this.temporaryGraphOutputs=[])}onReleaseSession(e){this.sessionGraphInputs.delete(e),this.sessionGraphOutputs.delete(e);let r=this.mlContextBySessionId.get(e);if(!r)return;this.tensorManager.releaseTensorsForSession(e),this.mlContextBySessionId.delete(e),this.mlOpSupportLimitsBySessionId.delete(e);let n=this.sessionIdsByMLContext.get(r);if(n.delete(e),n.size===0){this.sessionIdsByMLContext.delete(r);let o=this.mlContextCache.findIndex(i=>i.mlContext===r);o!==-1&&this.mlContextCache.splice(o,1)}}getMLContext(e){return this.mlContextBySessionId.get(e)}getMLOpSupportLimits(e){return this.mlOpSupportLimitsBySessionId.get(e)}reserveTensorId(){return this.tensorManager.reserveTensorId()}releaseTensorId(e){se("verbose",()=>`[WebNN] releaseTensorId {tensorId: ${e}}`),this.tensorManager.releaseTensorId(e)}async ensureTensor(e,r,n,o,i){let s=Kr.get(n);if(!s)throw new Error(`Unsupported ONNX data type: ${n}`);return this.tensorManager.ensureTensor(e??this.currentSessionId,r,s,o,i)}async createTemporaryTensor(e,r,n){se("verbose",()=>`[WebNN] createTemporaryTensor {onnxDataType: ${r}, shape: ${n}}`);let o=Kr.get(r);if(!o)throw new Error(`Unsupported ONNX data type: ${r}`);let i=this.tensorManager.reserveTensorId();await this.tensorManager.ensureTensor(e,i,o,n,!1);let s=this.temporarySessionTensorIds.get(e);return s?s.push(i):this.temporarySessionTensorIds.set(e,[i]),i}uploadTensor(e,r){if(!ge().shouldTransferToMLTensor)throw new Error("Trying to upload to a MLTensor while shouldTransferToMLTensor is false");se("verbose",()=>`[WebNN] uploadTensor {tensorId: ${e}, data: ${r.byteLength}}`),this.tensorManager.upload(e,r)}async downloadTensor(e,r){return this.tensorManager.download(e,r)}createMLTensorDownloader(e,r){return async()=>{let n=await this.tensorManager.download(e);return Hr(n,r)}}registerMLTensor(e,r,n,o){let i=Kr.get(n);if(!i)throw new Error(`Unsupported ONNX data type: ${n}`);let s=this.tensorManager.registerTensor(e,r,i,o);return se("verbose",()=>`[WebNN] registerMLTensor {tensor: ${r}, dataType: ${i}, dimensions: ${o}} -> {tensorId: ${s}}`),s}registerMLConstant(e,r,n,o,i,s,u=!1){if(!s)throw new Error("External mounted files are not available.");let d=e;e.startsWith("./")&&(d=e.substring(2));let c=s.get(d);if(!c)throw new Error(`File with name ${d} not found in preloaded files.`);if(r+n>c.byteLength)throw new Error("Out of bounds: data offset and length exceed the external file data size.");let p=c.slice(r,r+n).buffer,m;switch(i.dataType){case"float32":m=new Float32Array(p);break;case"float16":m=typeof Float16Array<"u"&&Float16Array.from?new Float16Array(p):new Uint16Array(p);break;case"int32":m=new Int32Array(p);break;case"uint32":m=new Uint32Array(p);break;case"int64":if(u){let g=io(new Uint8Array(p),"int64");m=new Int32Array(g.buffer),i.dataType="int32"}else m=new BigInt64Array(p);break;case"uint64":m=new BigUint64Array(p);break;case"int8":m=new Int8Array(p);break;case"int4":case"uint4":case"uint8":m=new Uint8Array(p);break;default:throw new Error(`Unsupported data type: ${i.dataType} in creating WebNN Constant from external data.`)}return se("verbose",()=>`[WebNN] registerMLConstant {dataType: ${i.dataType}, shape: ${i.shape}}} ${u?"(Note: it was int64 data type and registered to int32 as workaround)":""}`),o.constant(i,m)}registerGraphInput(e){this.temporaryGraphInputs.push(e)}registerGraphOutput(e){this.temporaryGraphOutputs.push(e)}isGraphInput(e,r){let n=this.sessionGraphInputs.get(e);return n?n.includes(r):!1}isGraphOutput(e,r){let n=this.sessionGraphOutputs.get(e);return n?n.includes(r):!1}isGraphInputOutputTypeSupported(e,r,n=!0){let o=Kr.get($t(r)),i=this.mlOpSupportLimitsBySessionId.get(e);return typeof o>"u"?!1:n?!!i?.input.dataTypes.includes(o):!!i?.output.dataTypes.includes(o)}flush(){}}});var Zr=V(()=>{"use strict"});var Rs,ao,so,Nf,Vf,Us,lo,uo,Vs,Ls=V(()=>{"use strict";nt();Zr();Rs=new Map([[64,250],[128,200],[256,200],[512,200],[2048,230],[4096,200],[8192,50],[16384,50],[32768,50],[65536,50],[131072,50],[262144,50],[524288,50],[1048576,50],[2097152,30],[4194304,20],[8388608,10],[12582912,10],[16777216,10],[26214400,15],[33554432,22],[44236800,2],[58982400,6],[67108864,6],[134217728,6],[167772160,6]]),ao=[],so=t=>Math.ceil(Number(t)/16)*16,Nf=t=>{for(let e=0;e<ao.length;e++){let r=ao[e];if(t<=r)return r}return Math.ceil(t/16)*16},Vf=1,Us=()=>Vf++,lo=async(t,e,r,n)=>{let o=so(r),i=t.device.createBuffer({size:o,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});try{let s=t.getCommandEncoder();t.endComputePass(),s.copyBufferToBuffer(e,0,i,0,o),t.flush(),await i.mapAsync(GPUMapMode.READ);let u=i.getMappedRange();if(n){let d=n();return d.set(new Uint8Array(u,0,r)),d}else return new Uint8Array(u.slice(0,r))}finally{i.destroy()}},uo=class{constructor(e){this.backend=e;this.storageCache=new Map,this.freeBuffers=new Map,this.freeUniformBuffers=new Map,this.buffersPending=[],this.capturedPendingBuffers=new Map;for(let[r]of Rs)ao.push(r),this.freeBuffers.set(r,[]),this.freeUniformBuffers.set(r,[]);this.sessionCount=0}upload(e,r){let n=r.buffer,o=r.byteOffset,i=r.byteLength,s=so(i),u=this.storageCache.get(e);if(!u)throw new Error("gpu data for uploading does not exist");if(Number(u.originalSize)!==i)throw new Error(`inconsistent data size. gpu data size=${u.originalSize}, data size=${i}`);let d=this.backend.device.createBuffer({mappedAtCreation:!0,size:s,usage:GPUBufferUsage.MAP_WRITE|GPUBufferUsage.COPY_SRC}),c=d.getMappedRange();new Uint8Array(c).set(new Uint8Array(n,o,i)),d.unmap();let p=this.backend.device.createCommandEncoder();p.copyBufferToBuffer(d,0,u.gpuData.buffer,0,s),this.backend.device.queue.submit([p.finish()]),d.destroy(),se("verbose",()=>`[WebGPU] GpuDataManager.upload(id=${e})`)}memcpy(e,r){let n=this.storageCache.get(e);if(!n)throw new Error("source gpu data for memcpy does not exist");let o=this.storageCache.get(r);if(!o)throw new Error("destination gpu data for memcpy does not exist");if(n.originalSize!==o.originalSize)throw new Error("inconsistent source and destination gpu data size");let i=so(n.originalSize),s=this.backend.getCommandEncoder();this.backend.endComputePass(),s.copyBufferToBuffer(n.gpuData.buffer,0,o.gpuData.buffer,0,i)}registerExternalBuffer(e,r,n){let o;if(n){if(o=n[0],e===n[1])return se("verbose",()=>`[WebGPU] GpuDataManager.registerExternalBuffer(size=${r}) => id=${o}, buffer is the same, skip.`),o;if(this.backend.capturedCommandList.has(this.backend.currentSessionId))throw new Error(`Registering a different external buffer under graph capture mode is not supported yet.
             Please use the previous external buffer!`)}else o=Us();return this.storageCache.set(o,{gpuData:{id:o,type:0,buffer:e},originalSize:r}),se("verbose",()=>`[WebGPU] GpuDataManager.registerExternalBuffer(size=${r}) => id=${o}, registered.`),o}unregisterExternalBuffer(e){e!==void 0&&(this.storageCache.delete(e),se("verbose",()=>`[WebGPU] GpuDataManager.unregisterExternalBuffer() => id=${e}`))}create(e,r=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST){let n=Nf(e),o,i=(r&GPUBufferUsage.STORAGE)===GPUBufferUsage.STORAGE,s=(r&GPUBufferUsage.UNIFORM)===GPUBufferUsage.UNIFORM;if(i||s){let c=(i?this.freeBuffers:this.freeUniformBuffers).get(n);c?c.length>0?o=c.pop():o=this.backend.device.createBuffer({size:n,usage:r}):o=this.backend.device.createBuffer({size:n,usage:r})}else o=this.backend.device.createBuffer({size:n,usage:r});let u={id:Us(),type:0,buffer:o};return this.storageCache.set(u.id,{gpuData:u,originalSize:Number(e)}),se("verbose",()=>`[WebGPU] GpuDataManager.create(size=${e}) => id=${u.id}`),u}get(e){return this.storageCache.get(e)?.gpuData}release(e){let r=typeof e=="bigint"?Number(e):e,n=this.storageCache.get(r);if(!n){if(this.storageCache.size===0)return 0;throw new Error("releasing data does not exist")}return se("verbose",()=>`[WebGPU] GpuDataManager.release(id=${r}), gpuDataId=${n.gpuData.id}`),this.storageCache.delete(r),this.buffersPending.push(n.gpuData.buffer),n.originalSize}async download(e,r){let n=this.storageCache.get(Number(e));if(!n)throw new Error("data does not exist");await lo(this.backend,n.gpuData.buffer,n.originalSize,r)}refreshPendingBuffers(){if(this.buffersPending.length!==0)if(this.backend.sessionStatus==="default"){for(let e of this.buffersPending){let r=Rs.get(e.size);if((e.usage&GPUBufferUsage.STORAGE)===GPUBufferUsage.STORAGE){let n=this.freeBuffers.get(e.size)||[];r===void 0||n.length>=r?e.destroy():n.push(e)}else if((e.usage&GPUBufferUsage.UNIFORM)===GPUBufferUsage.UNIFORM){let n=this.freeUniformBuffers.get(e.size)||[];r===void 0||n.length>=r?e.destroy():n.push(e)}else e.destroy()}this.buffersPending=[]}else{let e=this.capturedPendingBuffers.get(this.backend.currentSessionId);e||(e=[],this.capturedPendingBuffers.set(this.backend.currentSessionId,e));for(let r of this.buffersPending)e.push(r);this.buffersPending=[]}}dispose(){this.freeBuffers.forEach(e=>{e.forEach(r=>{r.destroy()})}),this.freeUniformBuffers.forEach(e=>{e.forEach(r=>{r.destroy()})}),this.storageCache.forEach(e=>{e.gpuData.buffer.destroy()}),this.capturedPendingBuffers.forEach(e=>{e.forEach(r=>{r.destroy()})}),this.storageCache=new Map,this.freeBuffers=new Map,this.freeUniformBuffers=new Map,this.capturedPendingBuffers=new Map}onCreateSession(){this.sessionCount+=1}onReleaseSession(e){let r=this.capturedPendingBuffers.get(e);r&&(r.forEach(n=>{n.destroy()}),this.capturedPendingBuffers.delete(e)),this.sessionCount-=1,this.sessionCount===0&&(se("warning",()=>"[WebGPU] Clearing webgpu buffer cache"),this.storageCache.forEach(n=>{n.gpuData.buffer.destroy()}),this.storageCache=new Map)}},Vs=(...t)=>new uo(...t)});var co,ee,Ie=V(()=>{"use strict";co=class{constructor(e){Object.assign(this,e)}get cacheKey(){return this.key||(this.key=Object.getOwnPropertyNames(this).sort().map(e=>`${this[e]}`).join(";")),this.key}},ee=t=>new co(t)});var Dt,mo,ye,Pe,L,fe,fo,Bt,je,F,Qr,O,R,Ws,Yr,po,Gs,ae=V(()=>{"use strict";J();ne();Dt=64,mo=(t,e)=>{if(e===3)throw new Error("vec3 has same alignment as vec4, use vec4 instead");switch(Number(t)){case 10:return e>1?`vec${e}<f16>`:"f16";case 1:return e>1?`vec${e}<f32>`:"f32";case 6:return e>1?`vec${e}<i32>`:"i32";case 12:return e>1?`vec${e}<u32>`:"u32";case 7:if(e>1)throw new Error("currently not supported vecX of uint64 yet");return["vec2<u32>","i32"];case 13:if(e>1)throw new Error("currently not supported vecX of uint64 yet");return["vec2<u32>","u32"];case 9:if(e!==4)throw new Error("bool must be vec4");return["u32","vec4<bool>"];case 22:return"i32";case 21:return"u32";default:throw new Error(`Unknown data type: ${t}`)}},ye=(t,e=1)=>{let r=mo(t,e);return typeof r=="string"?r:r[0]},Pe=(t,e=1)=>{let r=mo(t,e);return typeof r=="string"?r:r[1]},L=(...t)=>{let e=[];return t.forEach(r=>{r.length!==0&&e.push({type:12,data:r},{type:12,data:k.computeStrides(r)})}),e},fe=t=>t%4===0?4:t%2===0?2:1,fo=(t="f32",e,r="0")=>!e||e===1?`${t}(${r})`:`vec${e}<${t}>(${r})`,Bt=(t,e,r)=>t==="f32"?r:e===1?`f32(${r})`:`vec${e}<f32>(${r})`,je=(t,e)=>e===4?`(${t}.x + ${t}.y + ${t}.z + ${t}.w)`:e===2?`(${t}.x + ${t}.y)`:e===3?`(${t}.x + ${t}.y + ${t}.z)`:t,F=(t,e,r,n)=>t.startsWith("uniforms.")&&r>4?typeof e=="string"?n==="f16"?`${t}[(${e}) / 8][(${e}) % 8 / 4][(${e}) % 8 % 4]`:`${t}[(${e}) / 4][(${e}) % 4]`:n==="f16"?`${t}[${Math.floor(e/8)}][${Math.floor(e%8/4)}][${e%8%4}]`:`${t}[${Math.floor(e/4)}][${e%4}]`:r>1?`${t}[${e}]`:t,Qr=(t,e,r,n,o)=>{let i=typeof r=="number",s=i?r:r.length,u=[...new Array(s).keys()],d=s<2?"u32":s<=4?`vec${s}<u32>`:`array<u32, ${s}>`,c=mo(e,o),p=typeof c=="string"?c:c[1],m=typeof c=="string"?c:c[0],g={indices:d,value:p,storage:m,tensor:e},y=U=>typeof U=="string"?U:`${U}u`,b={offsetToIndices:!1,indicesToOffset:!1,broadcastedIndicesToOffset:!1,set:!1,setByIndices:!1,get:!1,getByIndices:!1},w=i?"uniforms.":"",S=`${w}${t}_shape`,x=`${w}${t}_strides`,$="";for(let U=0;U<s-1;U++)$+=`
    let dim${U} = current / ${F(x,U,s)};
    let rest${U} = current % ${F(x,U,s)};
    indices[${U}] = dim${U};
    current = rest${U};
    `;$+=`indices[${s-1}] = current;`;let T=s<2?"":`
  fn o2i_${t}(offset: u32) -> ${g.indices} {
    var indices: ${g.indices};
    var current = offset;
    ${$}
    return indices;
  }`,I=U=>(b.offsetToIndices=!0,s<2?U:`o2i_${t}(${U})`),E=[];if(s>=2)for(let U=s-1;U>=0;U--)E.push(`${F(x,U,s)} * (indices[${U}])`);let A=s<2?"":`
  fn i2o_${t}(indices: ${g.indices}) -> u32 {
    return ${E.join("+")};
  }`,z=U=>(b.indicesToOffset=!0,s<2?U:`i2o_${t}(${U})`),v=(...U)=>s===0?"0u":`${g.indices}(${U.map(y).join(",")})`,M=(U,X)=>s<2?`${U}`:`${F(U,X,s)}`,N=(U,X,Se)=>s<2?`${U}=${Se};`:`${F(U,X,s)}=${Se};`,K={},q=(U,X)=>{b.broadcastedIndicesToOffset=!0;let Se=`${X.name}broadcastedIndicesTo${t}Offset`;if(Se in K)return`${Se}(${U})`;let Be=[];for(let ze=s-1;ze>=0;ze--){let Xe=X.indicesGet("outputIndices",ze+X.rank-s);Be.push(`${M(x,ze)} * (${Xe} % ${M(S,ze)})`)}return K[Se]=`fn ${Se}(outputIndices: ${X.type.indices}) -> u32 {
             return ${Be.length>0?Be.join("+"):"0u"};
           }`,`${Se}(${U})`},Q=(U,X)=>(()=>{if(g.storage===g.value)return`${t}[${U}]=${X};`;if(g.storage==="vec2<u32>"&&g.value==="i32")return`${t}[${U}]=vec2<u32>(u32(${X}), select(0u, 0xFFFFFFFFu, ${X} < 0));`;if(g.storage==="vec2<u32>"&&g.value==="u32")return`${t}[${U}]=vec2<u32>(u32(${X}), 0u);`;if(g.storage==="u32"&&g.value==="vec4<bool>")return`${t}[${U}]=dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(${X}));`;throw new Error(`not supported combination of storage type ${g.storage} and value type ${g.value} yet`)})(),D=U=>(()=>{if(g.storage===g.value)return`${t}[${U}]`;if(g.storage==="vec2<u32>"&&g.value==="i32")return`i32(${t}[${U}].x)`;if(g.storage==="vec2<u32>"&&g.value==="u32")return`u32(${t}[${U}].x)`;if(g.storage==="u32"&&g.value==="vec4<bool>")return`vec4<bool>(bool(${t}[${U}] & 0xFFu), bool(${t}[${U}] & 0xFF00u), bool(${t}[${U}] & 0xFF0000u), bool(${t}[${U}] & 0xFF000000u))`;throw new Error(`not supported combination of storage type ${g.storage} and value type ${g.value} yet`)})(),W=s<2?"":`
  fn get_${t}ByIndices(indices: ${g.indices}) -> ${p} {
    return ${D(`i2o_${t}(indices)`)};
  }`,j=s<2?"":(()=>{let U=u.map(Se=>`d${Se}: u32`).join(", "),X=u.map(Se=>`d${Se}`).join(", ");return`
  fn get_${t}(${U}) -> ${p} {
    return get_${t}ByIndices(${v(X)});
  }`})(),Y=(...U)=>{if(U.length!==s)throw new Error(`indices length must be ${s}`);let X=U.map(y).join(",");return s===0?D("0u"):s===1?D(X[0]):(b.get=!0,b.getByIndices=!0,b.indicesToOffset=!0,`get_${t}(${X})`)},Z=U=>s<2?D(U):(b.getByIndices=!0,b.indicesToOffset=!0,`get_${t}ByIndices(${U})`),te=s<2?"":`
  fn set_${t}ByIndices(indices: ${g.indices}, value: ${p}) {
    ${Q(`i2o_${t}(indices)`,"value")}
  }`,ie=s<2?"":(()=>{let U=u.map(Se=>`d${Se}: u32`).join(", "),X=u.map(Se=>`d${Se}`).join(", ");return`
  fn set_${t}(${U}, value: ${p}) {
    set_${t}ByIndices(${v(X)}, value);
  }`})();return{impl:()=>{let U=[],X=!1;return b.offsetToIndices&&(U.push(T),X=!0),b.indicesToOffset&&(U.push(A),X=!0),b.broadcastedIndicesToOffset&&(Object.values(K).forEach(Se=>U.push(Se)),X=!0),b.set&&(U.push(ie),X=!0),b.setByIndices&&(U.push(te),X=!0),b.get&&(U.push(j),X=!0),b.getByIndices&&(U.push(W),X=!0),!i&&X&&U.unshift(`const ${S} = ${g.indices}(${r.join(",")});`,`const ${x} = ${g.indices}(${k.computeStrides(r).join(",")});`),U.join(`
`)},type:g,offsetToIndices:I,indicesToOffset:z,broadcastedIndicesToOffset:q,indices:v,indicesGet:M,indicesSet:N,set:(...U)=>{if(U.length!==s+1)throw new Error(`indices length must be ${s}`);let X=U[s];if(typeof X!="string")throw new Error("value must be string");let Se=U.slice(0,s).map(y).join(",");return s===0?Q("0u",X):s===1?Q(Se[0],X):(b.set=!0,b.setByIndices=!0,b.indicesToOffset=!0,`set_${t}(${Se}, ${X})`)},setByOffset:Q,setByIndices:(U,X)=>s<2?Q(U,X):(b.setByIndices=!0,b.indicesToOffset=!0,`set_${t}ByIndices(${U}, ${X});`),get:Y,getByOffset:D,getByIndices:Z,usage:n,name:t,strides:x,shape:S,rank:s}},O=(t,e,r,n=1)=>Qr(t,e,r,"input",n),R=(t,e,r,n=1)=>Qr(t,e,r,"output",n),Ws=(t,e,r)=>Qr(t,e,r,"atomicOutput",1),Yr=(t,e,r,n=1)=>Qr(t,e,r,"internal",n),po=class{constructor(e,r){this.normalizedDispatchGroup=e;this.limits=r;this.internalVariables=[];this.variables=[];this.uniforms=[];this.variableIndex=0}guardAgainstOutOfBoundsWorkgroupSizes(e){return`if (global_idx >= ${typeof e=="number"?`${e}u`:e}) { return; }`}mainStart(e=Dt){let r=typeof e=="number"?e:e[0],n=typeof e=="number"?1:e[1],o=typeof e=="number"?1:e[2];if(r>this.limits.maxComputeWorkgroupSizeX||n>this.limits.maxComputeWorkgroupSizeY||o>this.limits.maxComputeWorkgroupSizeZ)throw new Error(`workgroup size [${r}, ${n}, ${o}] exceeds the maximum workgroup size [${this.limits.maxComputeWorkgroupSizeX}, ${this.limits.maxComputeWorkgroupSizeY}, ${this.limits.maxComputeWorkgroupSizeZ}].`);if(r*n*o>this.limits.maxComputeInvocationsPerWorkgroup)throw new Error(`workgroup size [${r}, ${n}, ${o}] exceeds the maximum workgroup invocations ${this.limits.maxComputeInvocationsPerWorkgroup}.`);let i=this.normalizedDispatchGroup[1]===1&&this.normalizedDispatchGroup[2]===1,s=i?`@builtin(global_invocation_id) global_id : vec3<u32>,
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_index) local_idx : u32,
    @builtin(local_invocation_id) local_id : vec3<u32>`:`@builtin(global_invocation_id) global_id : vec3<u32>,
                                             @builtin(local_invocation_id) local_id : vec3<u32>,
    @builtin(local_invocation_index) local_idx : u32,
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(num_workgroups) num_workgroups : vec3<u32>`,u=i?`let global_idx = global_id.x;
         let workgroup_index = workgroup_id.x;`:`let workgroup_index = workgroup_id.z * num_workgroups[0] * num_workgroups[1] +
             workgroup_id.y * num_workgroups[0] + workgroup_id.x;
         let global_idx = workgroup_index * ${r*n*o}u + local_idx;`;return`@compute @workgroup_size(${r}, ${n}, ${o})
  fn main(${s}) {
    ${u}
  `}appendVariableUniforms(e){e.rank!==0&&(e.shape.startsWith("uniforms.")&&this.uniforms.push({name:e.shape.replace("uniforms.",""),type:"u32",length:e.rank}),e.strides.startsWith("uniforms.")&&this.uniforms.push({name:e.strides.replace("uniforms.",""),type:"u32",length:e.rank}))}declareVariable(e,r){if(e.usage==="internal")throw new Error("cannot use internal variable with declareVariable(). use registerInternalVariables() instead.");this.variables.push(e),this.appendVariableUniforms(e);let n=e.usage==="input"?"read":"read_write",o=e.usage==="atomicOutput"?"atomic<i32>":e.type.storage;return`@group(0) @binding(${r}) var<storage, ${n}> ${e.name}: array<${o}>;`}declareVariables(...e){return e.map(r=>this.declareVariable(r,this.variableIndex++)).join(`
`)}registerInternalVariable(e){if(e.usage!=="internal")throw new Error("cannot use input or output variable with registerInternalVariable(). use declareVariables() instead.");this.internalVariables.push(e),this.appendVariableUniforms(e)}registerInternalVariables(...e){return e.forEach(r=>this.registerInternalVariable(r)),this}registerUniform(e,r,n=1){return this.uniforms.push({name:e,type:r,length:n}),this}registerUniforms(e){return this.uniforms=this.uniforms.concat(e),this}uniformDeclaration(){if(this.uniforms.length===0)return"";let e=[];for(let{name:r,type:n,length:o}of this.uniforms)if(o&&o>4)n==="f16"?e.push(`@align(16) ${r}:array<mat2x4<${n}>, ${Math.ceil(o/8)}>`):e.push(`${r}:array<vec4<${n}>, ${Math.ceil(o/4)}>`);else{let i=o==null||o===1?n:`vec${o}<${n}>`;e.push(`${r}:${i}`)}return`
      struct Uniforms { ${e.join(", ")} };
      @group(0) @binding(${this.variableIndex}) var<uniform> uniforms: Uniforms;`}get additionalImplementations(){return this.uniformDeclaration()+this.variables.map(e=>e.impl()).join(`
`)+this.internalVariables.map(e=>e.impl()).join(`
`)}get variablesInfo(){if(this.uniforms.length===0)return;let e=r=>[12,10,1,6][["u32","f16","f32","i32"].indexOf(r)];return this.uniforms.map(r=>[e(r.type),r.length??1])}},Gs=(t,e)=>new po(t,e)});var Lf,Hs,Wf,Gf,Hf,Ff,Oe,Fs,qs,pt=V(()=>{"use strict";J();ne();Ie();ae();Lf=(t,e)=>{if(!t||t.length!==1)throw new Error("Transpose requires 1 input.");if(e.length!==0&&e.length!==t[0].dims.length)throw new Error(`perm size ${e.length} does not match input rank ${t[0].dims.length}`)},Hs=(t,e)=>e.length!==0?e:[...new Array(t).keys()].reverse(),Wf=(t,e)=>k.sortBasedOnPerm(t,Hs(t.length,e)),Gf=(t,e,r,n)=>{let o=`fn perm(i: ${n.type.indices}) -> ${r.type.indices} {
    var a: ${r.type.indices};`;for(let i=0;i<e;++i)o+=`a[${t[i]}]=i[${i}];`;return o+="return a;}"},Hf=(t,e)=>{let r=[],n=[];for(let o=0;o<t.length;++o)t[o]!==1&&r.push(t[o]),t[e[o]]!==1&&n.push(e[o]);return{newShape:r,newPerm:n}},Ff=(t,e)=>{let r=0;for(let n=0;n<t.length;++n)if(e[t[n]]!==1){if(t[n]<r)return!1;r=t[n]}return!0},Oe=(t,e)=>{let r=t.dataType,n=t.dims.length,o=Hs(n,e),i=Wf(t.dims,o),s=t.dims,u=i,d=n<2||Ff(o,t.dims),c;if(d)return c=w=>{let S=O("input",r,s,4),x=R("output",r,u,4);return`
  ${w.registerUniform("output_size","u32").declareVariables(S,x)}
  ${w.mainStart()}
    ${w.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    output[global_idx] = input[global_idx];
  }`},{name:"TransposeCopy",shaderCache:{inputDependencies:["type"]},getRunData:()=>{let w=k.size(i);return{outputs:[{dims:i,dataType:t.dataType}],dispatchGroup:{x:Math.ceil(w/64/4)},programUniforms:[{type:12,data:Math.ceil(w/4)}]}},getShaderSource:c};let{newShape:p,newPerm:m}=Hf(t.dims,o),g=k.areEqual(m,[2,3,1]),y=k.areEqual(m,[3,1,2]);if(p.length===2||g||y){s=g?[p[0],p[1]*p[2]]:y?[p[0]*p[1],p[2]]:p,u=[s[1],s[0]];let w=16;return c=S=>{let x=O("a",r,s.length),$=R("output",r,u.length);return`
  ${S.registerUniform("output_size","u32").declareVariables(x,$)}
  var<workgroup> tile : array<array<${$.type.value}, ${w+1}>, ${w}>;
  ${S.mainStart([w,w,1])}
    let stride = (uniforms.output_shape[1] - 1) / ${w} + 1;
    let workgroup_id_x = workgroup_index % stride;
    let workgroup_id_y = workgroup_index / stride;
    let input_col = workgroup_id_y * ${w}u + local_id.x;
    let input_row = workgroup_id_x * ${w}u + local_id.y;
    if (input_row < uniforms.a_shape[0] && input_col < uniforms.a_shape[1]) {
      tile[local_id.y][local_id.x] = ${x.getByIndices(`${x.type.indices}(input_row, input_col)`)};
    }
    workgroupBarrier();

    let output_col = workgroup_id_x * ${w}u + local_id.x;
    let output_row = workgroup_id_y * ${w}u + local_id.y;
    if (output_row < uniforms.output_shape[0] && output_col < uniforms.output_shape[1]) {
      ${$.setByIndices(`${$.type.indices}(output_row, output_col)`,"tile[local_id.x][local_id.y]")}
    }
  }`},{name:"TransposeShared",shaderCache:{inputDependencies:["type"]},getRunData:()=>{let S=k.size(i);return{outputs:[{dims:i,dataType:t.dataType}],dispatchGroup:{x:Math.ceil(u[1]/w),y:Math.ceil(u[0]/w)},programUniforms:[{type:12,data:S},...L(s,u)]}},getShaderSource:c}}return c=w=>{let S=O("a",r,s.length),x=R("output",r,u.length);return`
  ${w.registerUniform("output_size","u32").declareVariables(S,x)}

  ${Gf(o,n,S,x)}

  ${w.mainStart()}
    ${w.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let indices = ${x.offsetToIndices("global_idx")};
    let aIndices = perm(indices);

    ${x.setByOffset("global_idx",S.getByIndices("aIndices"))}
  }`},{name:"Transpose",shaderCache:{hint:`${e}`,inputDependencies:["rank"]},getRunData:()=>{let w=k.size(i);return{outputs:[{dims:i,dataType:t.dataType}],dispatchGroup:{x:Math.ceil(w/64)},programUniforms:[{type:12,data:w},...L(s,u)]}},getShaderSource:c}},Fs=(t,e)=>{Lf(t.inputs,e.perm),t.compute(Oe(t.inputs[0],e.perm))},qs=t=>ee({perm:t.perm})});var qf,Kf,jf,Zf,Qf,Yf,Xf,Jf,eh,th,it,Ks,js,Zs,Qs,Ys,Xs,Js,eu,tu,ru,nu=V(()=>{"use strict";J();ne();ae();Xr();pt();qf={max:"select(bestValue, candidate, candidate > bestValue)",min:"select(bestValue, candidate, candidate < bestValue)",mean:"bestValue + candidate",sum:"bestValue + candidate",prod:"bestValue * candidate",sumSquare:"bestValue + candidate * candidate",logSumExp:"bestValue + exp(candidate)",l1:"bestValue + abs(candidate)",l2:"bestValue + candidate * candidate",logSum:"bestValue + candidate"},Kf={max:"select(bestValue, candidate, candidate > bestValue)",min:"select(bestValue, candidate, candidate < bestValue)",mean:"bestValue + candidate",sum:"bestValue + candidate",prod:"bestValue * candidate",sumSquare:"bestValue + candidate",logSumExp:"bestValue + candidate",l1:"bestValue + candidate",l2:"bestValue + candidate",logSum:"bestValue + candidate"},jf={max:"_A[offset]",min:"_A[offset]",mean:"0",sum:"0",prod:"1",sumSquare:"0",logSumExp:"0",l1:"0",l2:"0",logSum:"0"},Zf={max:"bestValue",min:"bestValue",sum:"bestValue",prod:"bestValue",sumSquare:"bestValue",logSumExp:"log(bestValue)",l1:"bestValue",l2:"sqrt(bestValue)",logSum:"log(bestValue)"},Qf=(t,e)=>{let r=[];for(let n=e-t;n<e;++n)r.push(n);return r},Yf=(t,e)=>{let r=[],n=t.length;for(let i=0;i<n;i++)e.indexOf(i)===-1&&r.push(t[i]);let o=e.map(i=>t[i]);return[r,o]},Xf=(t,e)=>{let r=t.length+e.length,n=[],o=0;for(let i=0;i<r;i++)e.indexOf(i)===-1?n.push(t[o++]):n.push(1);return n},Jf=(t,e)=>{for(let r=0;r<t.length;++r)if(t[t.length-r-1]!==e-1-r)return!1;return!0},eh=(t,e)=>{let r=[];if(!Jf(t,e)){for(let n=0;n<e;++n)t.indexOf(n)===-1&&r.push(n);t.forEach(n=>r.push(n))}return r},th=(t,e,r,n,o,i,s)=>{let u=r[0].dims,d=k.size(i),c=k.size(s),p=O("_A",r[0].dataType,u),m=R("output",o,i),g=64;d===1&&(g=256);let y=`
          var<workgroup> aBestValues : array<f32, ${g}>;
       `,b=w=>`
        ${w.registerUniform("reduceSize","u32").declareVariables(p,m)}
        ${y}
        fn DIV_CEIL(a : u32, b : u32) -> u32 {
          return ((a - 1u) / b + 1u);
         }
         ${w.mainStart(g)}

          let outputIndex = global_idx / ${g};
          let offset = outputIndex * uniforms.reduceSize;

          var bestValue = f32(${jf[n]});
          let Length = uniforms.reduceSize;
          for (var k = local_idx; k < Length; k = k + ${g}) {
           let candidate = f32(${p.getByOffset("offset + k")});
           bestValue = ${qf[n]};
          }
          aBestValues[local_idx] = bestValue;
          workgroupBarrier();

         var reduceSize = min(Length, ${g}u);
         for (var currentSize = reduceSize / 2u; reduceSize > 1u;
             currentSize = reduceSize / 2u) {
           let interval = DIV_CEIL(reduceSize, 2u);
           if (local_idx < currentSize) {
            let candidate = aBestValues[local_idx + interval];
            bestValue = ${Kf[n]};
            aBestValues[local_idx] = bestValue;
           }
           reduceSize = interval;
           workgroupBarrier();
         }

         if (local_idx == 0u) {
          ${m.setByOffset("outputIndex",`${n==="mean"?`${m.type.storage}(bestValue / f32(uniforms.reduceSize))`:`${m.type.storage}(${Zf[n]})`}`)};
         }
        }`;return{name:t,shaderCache:{hint:`${e};${g}`,inputDependencies:["type"]},getShaderSource:b,getRunData:()=>({outputs:[{dims:i,dataType:o}],dispatchGroup:{x:d},programUniforms:[{type:12,data:c}]})}},it=(t,e,r,n)=>{let o=t.inputs.length===1?r:ho(t.inputs,r),i=o.axes;i.length===0&&!o.noopWithEmptyAxes&&(i=t.inputs[0].dims.map((y,b)=>b));let s=k.normalizeAxes(i,t.inputs[0].dims.length),u=s,d=t.inputs[0],c=eh(u,t.inputs[0].dims.length);c.length>0&&(d=t.compute(Oe(t.inputs[0],c),{inputs:[0],outputs:[-1]})[0],u=Qf(u.length,d.dims.length));let[p,m]=Yf(d.dims,u),g=p;o.keepDims&&(g=Xf(p,s)),t.compute(th(e,o.cacheKey,[d],n,t.inputs[0].dataType,g,m),{inputs:[d]})},Ks=(t,e)=>{it(t,"ReduceMeanShared",e,"mean")},js=(t,e)=>{it(t,"ReduceL1Shared",e,"l1")},Zs=(t,e)=>{it(t,"ReduceL2Shared",e,"l2")},Qs=(t,e)=>{it(t,"ReduceLogSumExpShared",e,"logSumExp")},Ys=(t,e)=>{it(t,"ReduceMaxShared",e,"max")},Xs=(t,e)=>{it(t,"ReduceMinShared",e,"min")},Js=(t,e)=>{it(t,"ReduceProdShared",e,"prod")},eu=(t,e)=>{it(t,"ReduceSumShared",e,"sum")},tu=(t,e)=>{it(t,"ReduceSumSquareShared",e,"sumSquare")},ru=(t,e)=>{it(t,"ReduceLogSumShared",e,"logSum")}});var at,rh,Jr,ho,st,nh,oh,ih,ah,sh,uh,dh,lh,ch,ph,ut,ou,iu,au,su,uu,du,lu,cu,pu,mu,Xr=V(()=>{"use strict";J();ne();Ie();ae();nu();at=t=>{if(!t||t.length===0||t.length>2)throw new Error("Reduce op requires 1 or 2 inputs.");if(t.length===2&&t[1].dims.length!==1)throw new Error("Invalid axes input dims.")},rh=t=>["","",`var value = ${t.getByIndices("input_indices")};`,""],Jr=(t,e,r,n,o,i,s=!1,u=!1)=>{let d=[],c=r[0].dims,p=c.length,m=k.normalizeAxes(o,p),g=!u&&m.length===0;c.forEach((S,x)=>{g||m.indexOf(x)>=0?s&&d.push(1):d.push(S)});let y=d.length,b=k.size(d);return{name:t,shaderCache:e,getShaderSource:S=>{let x=[],$=O("_A",r[0].dataType,p),T=R("output",i,y),I=n($,T,m),E=I[2];for(let A=0,z=0;A<p;A++)g||m.indexOf(A)>=0?(s&&z++,E=`for(var j${A}: u32 = 0; j${A} < ${c[A]}; j${A}++) {
                  ${I[2].includes("last_index")?`let last_index = j${A};`:""}
                  ${$.indicesSet("input_indices",A,`j${A}`)}
                  ${E}
                }`):(x.push(`${$.indicesSet("input_indices",A,T.indicesGet("output_indices",z))};`),z++);return`

        ${S.registerUniform("output_size","u32").declareVariables($,T)}

        ${S.mainStart()}
          ${S.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
          var input_indices: ${$.type.indices};
          let output_indices = ${T.offsetToIndices("global_idx")};

          ${x.join(`
`)}
          ${I[0]}       // init ops for reduce max/min
          ${I[1]}
          ${E}
          ${I[3]}
          ${I.length===4?T.setByOffset("global_idx","value"):I.slice(4).join(`
`)}
        }`},getRunData:()=>({outputs:[{dims:d,dataType:i}],dispatchGroup:{x:Math.ceil(b/64)},programUniforms:[{type:12,data:b},...L(c,d)]})}},ho=(t,e)=>{let r=[];return t[1].dims[0]>0&&t[1].getBigInt64Array().forEach(n=>r.push(Number(n))),ee({axes:r,keepDims:e.keepDims,noopWithEmptyAxes:e.noopWithEmptyAxes})},st=(t,e,r,n)=>{let o=t.inputs,i=o.length===1?r:ho(o,r);t.compute(Jr(e,{hint:i.cacheKey,inputDependencies:["rank"]},[o[0]],i.noopWithEmptyAxes&&i.axes.length===0?rh:n,i.axes,o[0].dataType,i.keepDims,i.noopWithEmptyAxes),{inputs:[0]})},nh=(t,e)=>{at(t.inputs),st(t,"ReduceLogSum",e,(n,o)=>[`var value = ${o.type.storage}(0);`,"",`value += ${n.getByIndices("input_indices")};`,"value = log(value);"])},oh=(t,e)=>{at(t.inputs),st(t,"ReduceL1",e,(n,o)=>[`var value = ${o.type.storage}(0);`,"",`value += abs(${n.getByIndices("input_indices")});`,""])},ih=(t,e)=>{at(t.inputs),st(t,"ReduceL2",e,(n,o)=>[`var t = ${o.type.value}(0); var value = ${o.type.value}(0);`,"",`t = ${n.getByIndices("input_indices")}; value += (t * t);`,"value = sqrt(value);"])},ah=(t,e)=>{at(t.inputs),st(t,"ReduceLogSumExp",e,(n,o)=>[`var value = ${o.type.storage}(0);`,"",`value += exp(${n.getByIndices("input_indices")});`,"value = log(value);"])},sh=(t,e)=>{at(t.inputs),st(t,"ReduceMax",e,(n,o,i)=>{let s=[];for(let u=0;u<n.rank;u++)(i.indexOf(u)>=0||i.length===0)&&s.push(n.indicesSet("input_indices",u,0));return[`${s.join(`
`)}`,`var value = ${n.getByIndices("input_indices")};`,`value = max(value, ${n.getByIndices("input_indices")});`,""]})},uh=(t,e)=>{at(t.inputs),st(t,"ReduceMean",e,(n,o,i)=>{let s=1;for(let u=0;u<n.rank;u++)(i.indexOf(u)>=0||i.length===0)&&(s*=t.inputs[0].dims[u]);return["var sum = f32(0);","",`sum += f32(${n.getByIndices("input_indices")});`,`let value = ${o.type.value}(sum / ${s});`]})},dh=(t,e)=>{at(t.inputs),st(t,"ReduceMin",e,(n,o,i)=>{let s=[];for(let u=0;u<n.rank;u++)(i.indexOf(u)>=0||i.length===0)&&s.push(`input_indices[${u}] = 0;`);return[`${s.join(`
`)}`,`var value = ${n.getByIndices("input_indices")};`,`value = min(value, ${n.getByIndices("input_indices")});`,""]})},lh=(t,e)=>{at(t.inputs),st(t,"ReduceProd",e,(n,o)=>[`var value = ${o.type.storage}(1);`,"",`value *= ${n.getByIndices("input_indices")};`,""])},ch=(t,e)=>{at(t.inputs),st(t,"ReduceSum",e,(n,o)=>[`var value = ${o.type.storage}(0);`,"",`value += ${n.getByIndices("input_indices")};`,""])},ph=(t,e)=>{at(t.inputs),st(t,"ReduceSumSquare",e,(n,o)=>[`var t = ${o.type.value}(0); var value = ${o.type.value}(0);`,"",`t = ${n.getByIndices("input_indices")}; value += t * t;`,""])},ut=(t,e,r)=>{if(e.length===0)return r;let n=1,o=1;for(let i=0;i<e.length;i++)e.indexOf(i)===-1?n*=t[i]:o*=t[i];return o<32&&n>1024},ou=(t,e)=>{ut(t.inputs[0].dims,e.axes,e.noopWithEmptyAxes)?uh(t,e):Ks(t,e)},iu=(t,e)=>{ut(t.inputs[0].dims,e.axes,e.noopWithEmptyAxes)?oh(t,e):js(t,e)},au=(t,e)=>{ut(t.inputs[0].dims,e.axes,e.noopWithEmptyAxes)?ih(t,e):Zs(t,e)},su=(t,e)=>{ut(t.inputs[0].dims,e.axes,e.noopWithEmptyAxes)?ah(t,e):Qs(t,e)},uu=(t,e)=>{ut(t.inputs[0].dims,e.axes,e.noopWithEmptyAxes)?sh(t,e):Ys(t,e)},du=(t,e)=>{ut(t.inputs[0].dims,e.axes,e.noopWithEmptyAxes)?dh(t,e):Xs(t,e)},lu=(t,e)=>{ut(t.inputs[0].dims,e.axes,e.noopWithEmptyAxes)?lh(t,e):Js(t,e)},cu=(t,e)=>{ut(t.inputs[0].dims,e.axes,e.noopWithEmptyAxes)?ch(t,e):eu(t,e)},pu=(t,e)=>{ut(t.inputs[0].dims,e.axes,e.noopWithEmptyAxes)?ph(t,e):tu(t,e)},mu=(t,e)=>{ut(t.inputs[0].dims,e.axes,e.noopWithEmptyAxes)?nh(t,e):ru(t,e)}});var fu,hu,gu,go,bu=V(()=>{"use strict";J();Ie();Xr();fu=t=>{if(!t||t.length===0||t.length>2)throw new Error("ArgMinMaxOp op requires 1 or 2 inputs.");if(t[0].dataType!==1)throw new Error("Invalid input type.")},hu=(t,e)=>{fu(t.inputs);let r=(n,o,i)=>{let s=[];for(let u=0;u<n.rank;u++)(i.indexOf(u)>=0||i.length===0)&&s.push(`input_indices[${u}] = 0;`);return[`${s.join(`
`)}`,`var value = ${n.getByIndices("input_indices")};
var best_index : i32 = 0;`,`if (${n.getByIndices("input_indices")} ${e.selectLastIndex>0?"<=":"<"} value) {
         value = ${n.getByIndices("input_indices")};
         best_index = i32(last_index);
       }`,"",o.setByOffset("global_idx","best_index")]};t.compute(Jr("ArgMin",{hint:e.cacheKey,inputDependencies:["rank"]},[t.inputs[0]],r,[e.axis],7,e.keepDims),{inputs:[0]})},gu=(t,e)=>{fu(t.inputs);let r=(n,o,i)=>{let s=[];for(let u=0;u<n.rank;u++)(i.indexOf(u)>=0||i.length===0)&&s.push(`input_indices[${u}] = 0;`);return[`${s.join(`
`)}`,`var value = ${n.getByIndices("input_indices")};
var best_index : i32 = 0;`,`if (${n.getByIndices("input_indices")} ${e.selectLastIndex>0?">=":">"} value) {
         value = ${n.getByIndices("input_indices")};
         best_index = i32(last_index);
       }`,"",o.setByOffset("global_idx","best_index")]};t.compute(Jr("argMax",{hint:e.cacheKey,inputDependencies:["rank"]},[t.inputs[0]],r,[e.axis],7,e.keepDims),{inputs:[0]})},go=t=>ee(t)});var mh,bo,fh,hh,gh,Wt,bh,yu,en=V(()=>{"use strict";J();ne();Zr();ae();mh=(t,e)=>{let r=t[0],n=t[1],o=t[2],i=t[3],s=t[4],u=t[5];if(s&&u)throw new Error("Attention cannot have both past and attention_bias");if(r.dims.length!==3)throw new Error('Input "input" must have 3 dimensions');let d=r.dims[0],c=r.dims[1],p=r.dims[2];if(o.dims.length!==1)throw new Error('Input "bias" is expected to have 1 dimensions');if(n.dims.length!==2)throw new Error('Input "weights" is expected to have 2 dimensions');if(n.dims[0]!==p)throw new Error("Input 1 dimension 0 should have same length as dimension 2 of input 0");if(o.dims[0]!==n.dims[1])throw new Error('Input "bias" dimension 0 should have same length as dimension 1 of input "weights"');let m=o.dims[0]/3,g=m,y=g;if(e.qkvHiddenSizes.length>0){if(e.qkvHiddenSizes.length!==3)throw new Error("qkv_hidden_sizes attribute should have 3 elements");for(let T of e.qkvHiddenSizes)if(T%e.numHeads!==0)throw new Error("qkv_hidden_sizes should be divisible by num_heads");m=e.qkvHiddenSizes[0],g=e.qkvHiddenSizes[1],y=e.qkvHiddenSizes[2]}let b=c;if(m!==g)throw new Error("qkv_hidden_sizes first element should be same as the second");if(o.dims[0]!==m+g+y)throw new Error('Input "bias" dimension 0 should have same length as sum of Q/K/V hidden sizes');let w=0;if(s){if(g!==y)throw new Error('Input "past" expect k_hidden_size == v_hidden_size');if(s.dims.length!==5)throw new Error('Input "past" must have 5 dimensions');if(s.dims[0]!==2)throw new Error('Input "past" first dimension must be 2');if(s.dims[1]!==d)throw new Error('Input "past" second dimension must be batch_size');if(s.dims[2]!==e.numHeads)throw new Error('Input "past" third dimension must be num_heads');if(s.dims[4]!==g/e.numHeads)throw new Error('Input "past" fifth dimension must be k_hidden_size / num_heads');e.pastPresentShareBuffer||(w=s.dims[3])}let S=b+w,x=-1,$=0;if(i)throw new Error("Mask not supported");if(s)throw new Error("past is not supported");if(u){if(u.dims.length!==4)throw new Error('Input "attention_bias" must have 4 dimensions');if(u.dims[0]!==d||u.dims[1]!==e.numHeads||u.dims[2]!==c||u.dims[3]!==S)throw new Error('Expect "attention_bias" shape (batch_size, num_heads, sequence_length, total_sequence_length)')}return{batchSize:d,sequenceLength:c,pastSequenceLength:w,kvSequenceLength:b,totalSequenceLength:S,maxSequenceLength:x,inputHiddenSize:p,hiddenSize:m,vHiddenSize:y,headSize:Math.floor(m/e.numHeads),vHeadSize:Math.floor(y/e.numHeads),numHeads:e.numHeads,isUnidirectional:!1,pastPresentShareBuffer:!1,maskFilterValue:e.maskFilterValue,maskType:$,scale:e.scale,broadcastResPosBias:!1,passPastInKv:!1,qkvFormat:1}},bo=(t,e,r)=>e&&t?`
      let total_sequence_length_input = u32(${e.getByOffset("0")});
      let present_sequence_length = max(total_sequence_length_input, uniforms.past_sequence_length);
      let is_subsequent_prompt: bool = sequence_length > 1 && sequence_length != total_sequence_length_input;
      let is_first_prompt: bool = is_subsequent_prompt == false && sequence_length == total_sequence_length_input;
      total_sequence_length = u32(${t?.getByOffset("batchIdx")}) + 1;
      var past_sequence_length: u32 = 0;
      if (is_first_prompt == false) {
        past_sequence_length = total_sequence_length - sequence_length;
      }
       `:`
    ${r?"let past_sequence_length = uniforms.past_sequence_length":""};
    let present_sequence_length = total_sequence_length;
    `,fh=(t,e,r,n,o,i,s,u)=>{let d=fe(s?1:i),c=64,p=i/d;p<c&&(c=32);let m=Math.ceil(i/d/c),g=[{type:12,data:e},{type:12,data:r},{type:12,data:n},{type:12,data:o},{type:12,data:p},{type:12,data:m}],y=ye(t.dataType,d),b=Pe(1,d),w=["type"];s&&w.push("type"),u&&w.push("type");let S=x=>{let $=R("x",t.dataType,t.dims,d),T=[$],I=s?O("seq_lens",s.dataType,s.dims):void 0;I&&T.push(I);let E=u?O("total_sequence_length_input",u.dataType,u.dims):void 0;E&&T.push(E);let A=Pe(t.dataType),z=[{name:"batch_size",type:"u32"},{name:"num_heads",type:"u32"},{name:"past_sequence_length",type:"u32"},{name:"sequence_length",type:"u32"},{name:"total_sequence_length",type:"u32"},{name:"elements_per_thread",type:"u32"}];return`
  var<workgroup> thread_max: array<f32, ${c}>;
  var<workgroup> thread_sum: array<f32, ${c}>;
  ${x.registerUniforms(z).declareVariables(...T)}
  ${x.mainStart([c,1,1])}
    let batchIdx = workgroup_id.z / uniforms.num_heads;
    let headIdx = workgroup_id.z % uniforms.num_heads;
    let sequence_length = uniforms.sequence_length;
    var total_sequence_length = uniforms.total_sequence_length;
    ${bo(I,E,!1)}
    let local_offset = local_idx * uniforms.elements_per_thread;
    let offset = (global_idx / ${c}) * uniforms.total_sequence_length + local_offset;
    let seq_causal_length = ${s?"u32(past_sequence_length + workgroup_id.y + 1)":"total_sequence_length"};
    var thread_max_vector = ${b}(-3.4028234663852886e+38f);
    for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
      thread_max_vector = max(${b}(x[offset + i]), thread_max_vector);
    }
    thread_max[local_idx] = ${(()=>{switch(d){case 1:return"thread_max_vector";case 2:return"max(thread_max_vector.x, thread_max_vector.y)";case 4:return"max(max(thread_max_vector.x, thread_max_vector.y), max(thread_max_vector.z, thread_max_vector.w))";default:throw new Error(`Unsupported components: ${d}`)}})()};
    workgroupBarrier();

    var max_value =  f32(-3.4028234663852886e+38f);
    for (var i = 0u; i < ${c}; i++) {
      max_value = max(thread_max[i], max_value);
    }

    var sum_vector = ${b}(0);
    for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
      sum_vector += exp(${b}(x[offset + i]) - max_value);
    }
    thread_sum[local_idx] = ${(()=>{switch(d){case 1:return"sum_vector";case 2:return"sum_vector.x + sum_vector.y";case 4:return"sum_vector.x + sum_vector.y + sum_vector.z + sum_vector.w";default:throw new Error(`Unsupported components: ${d}`)}})()};
    workgroupBarrier();

    var sum: f32 = 0;
    for (var i = 0u; i < ${c}; i++) {
      sum += thread_sum[i];
    }

    if (sum == 0) {
      for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
        x[offset + i] = ${$.type.value}(${A}(1.0) / ${A}(seq_causal_length));
      }
    } else {
      for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
        var f32input = ${b}(x[offset + i]);
        x[offset + i] = ${$.type.value}(exp(f32input - max_value) / sum);
      }
    }
      ${s?`
        for (var total_seq_id: u32 = seq_causal_length; total_seq_id + local_offset < uniforms.total_sequence_length; total_seq_id++) {
          x[offset + total_seq_id] = ${$.type.value}(${A}(0));
        }`:""};
  }`};return{name:"AttentionProbsSoftmax",shaderCache:{hint:`${c};${y};${d}`,inputDependencies:w},getShaderSource:S,getRunData:()=>({outputs:[],dispatchGroup:{x:1,y:o,z:e*r},programUniforms:g})}},hh=(t,e,r,n,o,i,s,u,d)=>{let c=s+i.kvSequenceLength,p=[i.batchSize,i.numHeads,i.sequenceLength,c],m=t>1&&n,g=i.kvNumHeads?i.kvNumHeads:i.numHeads,y=m?[i.batchSize,g,c,i.headSize]:void 0,b=i.nReps?i.nReps:1,w=i.scale===0?1/Math.sqrt(i.headSize):i.scale,S=fe(i.headSize),x=i.headSize/S,$=12,T={x:Math.ceil(c/$),y:Math.ceil(i.sequenceLength/$),z:i.batchSize*i.numHeads},I=[{type:12,data:i.sequenceLength},{type:12,data:x},{type:12,data:c},{type:12,data:i.numHeads},{type:12,data:i.headSize},{type:1,data:w},{type:12,data:s},{type:12,data:i.kvSequenceLength},{type:12,data:b}],E=m&&n&&k.size(n.dims)>0,A=["type","type"];E&&A.push("type"),o&&A.push("type"),u&&A.push("type"),d&&A.push("type");let z=[{dims:p,dataType:e.dataType,gpuDataType:0}];m&&z.push({dims:y,dataType:e.dataType,gpuDataType:0});let v=M=>{let N=O("q",e.dataType,e.dims,S),K=O("key",r.dataType,r.dims,S),q=[N,K];if(E){let te=O("past_key",n.dataType,n.dims,S);q.push(te)}o&&q.push(O("attention_bias",o.dataType,o.dims));let Q=u?O("seq_lens",u.dataType,u.dims):void 0;Q&&q.push(Q);let D=d?O("total_sequence_length_input",d.dataType,d.dims):void 0;D&&q.push(D);let W=R("output",e.dataType,p),j=[W];m&&j.push(R("present_key",e.dataType,y,S));let Y=Pe(1,S),Z=[{name:"M",type:"u32"},{name:"K",type:"u32"},{name:"N",type:"u32"},{name:"num_heads",type:"u32"},{name:"head_size",type:"u32"},{name:"alpha",type:"f32"},{name:"past_sequence_length",type:"u32"},{name:"kv_sequence_length",type:"u32"},{name:"n_reps",type:"u32"}];return`
  const TILE_SIZE = ${$}u;

  var<workgroup> tileQ: array<${N.type.storage}, ${$*$}>;
  var<workgroup> tileK: array<${N.type.storage}, ${$*$}>;
  ${M.registerUniforms(Z).declareVariables(...q,...j)}
  ${M.mainStart([$,$,1])}
    // x holds the N and y holds the M
    let headIdx = workgroup_id.z % uniforms.num_heads;
    let kvHeadIdx = ${b===1?"headIdx":"headIdx / uniforms.n_reps"};
    let kv_num_heads = ${b===1?"uniforms.num_heads":"uniforms.num_heads / uniforms.n_reps"};
    let batchIdx = workgroup_id.z / uniforms.num_heads;
    let m = workgroup_id.y * TILE_SIZE;
    let n = workgroup_id.x * TILE_SIZE;
    let sequence_length = uniforms.M;
    var total_sequence_length = uniforms.N;
    ${bo(Q,D,!0)}
    let absKvHeadIdx = batchIdx * kv_num_heads + kvHeadIdx;
    let qOffset = workgroup_id.z * uniforms.M * uniforms.K + m * uniforms.K;
    ${E&&m?"let pastKeyOffset = absKvHeadIdx * uniforms.past_sequence_length * uniforms.K;":""};
    let kOffset = absKvHeadIdx * uniforms.kv_sequence_length * uniforms.K;
    ${m?"let presentKeyOffset = absKvHeadIdx * uniforms.N * uniforms.K;":""}
    var value = ${Y}(0);
    for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (global_id.y < uniforms.M && w + local_id.x < uniforms.K) {
        tileQ[TILE_SIZE * local_id.y + local_id.x] = q[qOffset + local_id.y * uniforms.K + w + local_id.x];
      }
      if (n + local_id.y < uniforms.N && w + local_id.x < uniforms.K) {
        var idx = TILE_SIZE * local_id.y + local_id.x;
      ${E&&m?`
              if (n + local_id.y < past_sequence_length) {
                tileK[idx] = past_key[pastKeyOffset + (n + local_id.y) * uniforms.K + w + local_id.x];
              } else if (n + local_id.y - past_sequence_length < uniforms.kv_sequence_length) {
                tileK[idx] = key[kOffset + (n + local_id.y - past_sequence_length) * uniforms.K + w + local_id.x];
              }`:`
          if (n + local_id.y < uniforms.kv_sequence_length) {
            tileK[idx] = key[kOffset + (n + local_id.y) * uniforms.K + w + local_id.x];
          }`}
      ${m?`if (n + local_id.y < present_sequence_length) {
        present_key[presentKeyOffset + (n + local_id.y) * uniforms.K + w + local_id.x] = tileK[idx];
      }`:""}
      }
      workgroupBarrier();

      for (var k: u32 = 0u; k < TILE_SIZE && w+k < uniforms.K; k++) {
          value += ${Y}(tileQ[TILE_SIZE * local_id.y + k] * tileK[TILE_SIZE * local_id.x + k]);
      }

      workgroupBarrier();
    }

    if (global_id.y < uniforms.M && global_id.x < total_sequence_length) {
      let headOffset = workgroup_id.z * uniforms.M * uniforms.N;
      let outputIdx = headOffset + global_id.y * uniforms.N + global_id.x;
      var sum: f32 = ${(()=>{switch(S){case 1:return"value";case 2:return"value.x + value.y";case 4:return"value.x + value.y + value.z + value.w";default:throw new Error(`Unsupported components: ${S}`)}})()};
        output[outputIdx] = ${W.type.value} (sum * uniforms.alpha) + ${o?"attention_bias[outputIdx]":"0.0"};
    }
  }`};return{name:"AttentionProbs",shaderCache:{hint:`${S};${o!==void 0};${n!==void 0};${t}`,inputDependencies:A},getRunData:()=>({outputs:z,dispatchGroup:T,programUniforms:I}),getShaderSource:v}},gh=(t,e,r,n,o,i,s=void 0,u=void 0)=>{let d=i+o.kvSequenceLength,c=o.nReps?o.nReps:1,p=o.vHiddenSize*c,m=t>1&&n,g=o.kvNumHeads?o.kvNumHeads:o.numHeads,y=m?[o.batchSize,g,d,o.headSize]:void 0,b=[o.batchSize,o.sequenceLength,p],w=12,S={x:Math.ceil(o.vHeadSize/w),y:Math.ceil(o.sequenceLength/w),z:o.batchSize*o.numHeads},x=[{type:12,data:o.sequenceLength},{type:12,data:d},{type:12,data:o.vHeadSize},{type:12,data:o.numHeads},{type:12,data:o.headSize},{type:12,data:p},{type:12,data:i},{type:12,data:o.kvSequenceLength},{type:12,data:c}],$=m&&n&&k.size(n.dims)>0,T=["type","type"];$&&T.push("type"),s&&T.push("type"),u&&T.push("type");let I=[{dims:b,dataType:e.dataType,gpuDataType:0}];m&&I.push({dims:y,dataType:e.dataType,gpuDataType:0});let E=A=>{let z=O("probs",e.dataType,e.dims),v=O("v",r.dataType,r.dims),M=[z,v];$&&M.push(O("past_value",n.dataType,n.dims));let N=s?O("seq_lens",s.dataType,s.dims):void 0;s&&M.push(N);let K=u?O("total_sequence_length_input",u.dataType,u.dims):void 0;u&&M.push(K);let Q=[R("output",e.dataType,b)];m&&Q.push(R("present_value",e.dataType,y));let D=[{name:"M",type:"u32"},{name:"K",type:"u32"},{name:"N",type:"u32"},{name:"num_heads",type:"u32"},{name:"head_size",type:"u32"},{name:"v_hidden_size",type:"u32"},{name:"past_sequence_length",type:"u32"},{name:"kv_sequence_length",type:"u32"},{name:"n_reps",type:"u32"}];return`
  const TILE_SIZE = ${w}u;
  var<workgroup> tileQ: array<${z.type.value}, ${w*w}>;
  var<workgroup> tileV: array<${z.type.value}, ${w*w}>;
  ${A.registerUniforms(D).declareVariables(...M,...Q)}
  ${A.mainStart([w,w,1])}
   let headIdx = workgroup_id.z % uniforms.num_heads;
   let batchIdx = workgroup_id.z / uniforms.num_heads;
   let kvHeadIdx = ${c===1?"headIdx":"headIdx / uniforms.n_reps"};
   let kv_num_heads = ${c===1?"uniforms.num_heads":"uniforms.num_heads / uniforms.n_reps"};
   let m = global_id.y;
   let n = global_id.x;
   let sequence_length = uniforms.M;
   var total_sequence_length = uniforms.K;
   ${bo(N,K,!0)}
   let offsetA = workgroup_id.z * uniforms.M * uniforms.K + m * uniforms.K;
   let absKvHeadIdx = batchIdx * kv_num_heads + kvHeadIdx; // kvHeadIdx is relative to the batch
   ${$&&m?"let pastValueOffset = absKvHeadIdx * uniforms.N * uniforms.past_sequence_length + n;":""};
   let vOffset = absKvHeadIdx * uniforms.N * uniforms.kv_sequence_length + n;
   ${m?"let presentValueOffset = absKvHeadIdx * uniforms.N * uniforms.K + n;":""}
   var value = ${z.type.storage}(0);
   for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (m < uniforms.M && w + local_id.x < uniforms.K) {
        tileQ[TILE_SIZE * local_id.y + local_id.x] = probs[offsetA + w + local_id.x];
      }
      if (n < uniforms.N && w + local_id.y < uniforms.K) {
        var idx = TILE_SIZE * local_id.y + local_id.x;
        ${$&&m?`
        if (w + local_id.y < past_sequence_length) {
          tileV[idx] = past_value[pastValueOffset + (w + local_id.y) * uniforms.N];
        } else if (w + local_id.y - past_sequence_length < uniforms.kv_sequence_length) {
          tileV[idx] = v[vOffset + (w + local_id.y - past_sequence_length) * uniforms.N];
        }
      `:`
            if (w + local_id.y < uniforms.kv_sequence_length) {
              tileV[idx] = v[vOffset + (w + local_id.y) * uniforms.N];
            }`}
        ${m?`
            if (w + local_id.y < present_sequence_length) {
          present_value[presentValueOffset + (w + local_id.y) * uniforms.N] = tileV[idx];
        }`:""}
      }
     workgroupBarrier();
     for (var k: u32 = 0u; k < TILE_SIZE && w+k < total_sequence_length; k++) {
       value += tileQ[TILE_SIZE * local_id.y + k] * tileV[TILE_SIZE * k + local_id.x];
     }
     workgroupBarrier();
   }

   // we need to transpose output from BNSH_v to BSND_v
   if (m < uniforms.M && n < uniforms.N) {
     let outputIdx = batchIdx * uniforms.M * uniforms.v_hidden_size + m * uniforms.v_hidden_size
       + headIdx * uniforms.N + n;
     output[outputIdx] = value;
   }
  }`};return{name:"AttentionScore",shaderCache:{hint:`${n!==void 0};${t}`,inputDependencies:T},getRunData:()=>({outputs:I,dispatchGroup:S,programUniforms:x}),getShaderSource:E}},Wt=(t,e,r,n,o,i,s,u,d,c,p=void 0,m=void 0)=>{let g=Math.min(t.outputCount,1+(s?1:0)+(u?1:0)),y=g>1?c.pastSequenceLength:0,b=y+c.kvSequenceLength,w=d&&k.size(d.dims)>0?d:void 0,S=[e,r];g>1&&s&&k.size(s.dims)>0&&S.push(s),w&&S.push(w),p&&S.push(p),m&&S.push(m);let x=t.compute(hh(g,e,r,s,w,c,y,p,m),{inputs:S,outputs:g>1?[-1,1]:[-1]})[0];t.compute(fh(x,c.batchSize,c.numHeads,y,c.sequenceLength,b,p,m),{inputs:p&&m?[x,p,m]:[x],outputs:[]});let $=[x,n];g>1&&u&&k.size(u.dims)>0&&$.push(u),p&&$.push(p),m&&$.push(m),t.compute(gh(g,x,n,u,c,y,p,m),{inputs:$,outputs:g>1?[0,2]:[0]})},bh=(t,e)=>{let r=[e.batchSize,e.numHeads,e.sequenceLength,e.headSize],n=e.sequenceLength,o=e.inputHiddenSize,i=e.headSize,s=12,u={x:Math.ceil(e.headSize/s),y:Math.ceil(e.sequenceLength/s),z:e.batchSize*e.numHeads},d=[t.inputs[0],t.inputs[1],t.inputs[2]],c=[{type:12,data:n},{type:12,data:o},{type:12,data:i},{type:12,data:e.numHeads},{type:12,data:e.headSize},{type:12,data:e.hiddenSize},{type:12,data:e.hiddenSize+e.hiddenSize+e.vHiddenSize}],p=m=>{let g=R("output_q",d[0].dataType,r),y=R("output_k",d[0].dataType,r),b=R("output_v",d[0].dataType,r),w=O("input",d[0].dataType,d[0].dims),S=O("weight",d[1].dataType,d[1].dims),x=O("bias",d[2].dataType,d[2].dims),$=w.type.storage,T=[{name:"M",type:"u32"},{name:"K",type:"u32"},{name:"N",type:"u32"},{name:"num_heads",type:"u32"},{name:"head_size",type:"u32"},{name:"hidden_size",type:"u32"},{name:"ldb",type:"u32"}];return`
  const TILE_SIZE = ${s}u;
  var<workgroup> tileInput: array<${$}, ${s*s}>;
  var<workgroup> tileWeightQ: array<${$}, ${s*s}>;
  var<workgroup> tileWeightK: array<${$}, ${s*s}>;
  var<workgroup> tileWeightV: array<${$}, ${s*s}>;
  ${m.registerUniforms(T).declareVariables(w,S,x,g,y,b)}
  ${m.mainStart([s,s,1])}
    let batchIndex = workgroup_id.z / uniforms.num_heads;
    let headNumber = workgroup_id.z % uniforms.num_heads;
    let m = global_id.y;
    let n = global_id.x;

    let inputOffset = batchIndex * (uniforms.M * uniforms.K) + m * uniforms.K;
    let biasOffsetQ = headNumber * uniforms.head_size;
    let biasOffsetK = uniforms.hidden_size + biasOffsetQ;
    let biasOffsetV = uniforms.hidden_size + biasOffsetK;

    var valueQ = ${$}(0);
    var valueK = ${$}(0);
    var valueV = ${$}(0);
    for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (m < uniforms.M && w + local_id.x < uniforms.K) {
        tileInput[TILE_SIZE * local_id.y + local_id.x] = input[inputOffset + w + local_id.x];
      }
      if (n < uniforms.N && w + local_id.y < uniforms.K) {
        let offset = n + (w + local_id.y) * uniforms.ldb;
        tileWeightQ[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetQ + offset];
        tileWeightK[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetK + offset];
        tileWeightV[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetV + offset];
      }
      workgroupBarrier();
      for (var k: u32 = 0u; k<TILE_SIZE && w+k < uniforms.K; k++) {
        let inputTileOffset = TILE_SIZE * local_id.y + k;
        let weightTileOffset = TILE_SIZE * k + local_id.x;
        valueQ += tileInput[inputTileOffset] * tileWeightQ[weightTileOffset];
        valueK += tileInput[inputTileOffset] * tileWeightK[weightTileOffset];
        valueV += tileInput[inputTileOffset] * tileWeightV[weightTileOffset];
      }

      workgroupBarrier();
    }

    let headOffset = (m * uniforms.N + n) % uniforms.head_size;
    valueQ += bias[headOffset + biasOffsetQ];
    valueK += bias[headOffset + biasOffsetK];
    valueV += bias[headOffset + biasOffsetV];

    let offset = workgroup_id.z * uniforms.M * uniforms.N;
    if (m < uniforms.M && n < uniforms.N) {
      let outputIdx = offset + m * uniforms.N + n;
      output_q[outputIdx] = valueQ;
      output_k[outputIdx] = valueK;
      output_v[outputIdx] = valueV;
    }
  }`};return t.compute({name:"AttentionPrepare",shaderCache:{inputDependencies:["type","type","type"]},getRunData:()=>({outputs:[{dims:r,dataType:t.inputs[0].dataType,gpuDataType:0},{dims:r,dataType:t.inputs[0].dataType,gpuDataType:0},{dims:r,dataType:t.inputs[0].dataType,gpuDataType:0}],dispatchGroup:u,programUniforms:c}),getShaderSource:p},{inputs:d,outputs:[-1,-1,-1]})},yu=(t,e)=>{let r=mh(t.inputs,e),[n,o,i]=bh(t,r);return Wt(t,n,o,i,t.inputs[4],void 0,void 0,void 0,t.inputs[5],r)}});var yh,wh,_h,wu,_u=V(()=>{"use strict";Ve();J();ne();Ie();ae();yh=(t,e)=>{if(!t||t.length!==5)throw new Error("BatchNormalization requires 5 inputs");let r=(n,o,i)=>{let s=o.length;if(s!==n.length)throw new Error(`${i}: num dimensions != ${s}`);o.forEach((u,d)=>{if(u!==n[d])throw new Error(`${i}: dim[${d}] do not match`)})};if(t[0].dims.length>1){let n=e.format==="NHWC"?e.spatial?t[0].dims.slice(-1):t[0].dims.slice(-1).concat(t[0].dims.slice(1,t[0].dims.length-1)):t[0].dims.slice(1,e.spatial?2:void 0);r(t[1].dims,n,"Invalid input scale"),r(t[2].dims,n,"Invalid input B"),r(t[3].dims,n,"Invalid input mean"),r(t[4].dims,n,"Invalid input var")}else r(t[1].dims,[1],"Invalid input scale"),r(t[2].dims,[1],"Invalid input B"),r(t[3].dims,[1],"Invalid input mean"),r(t[4].dims,[1],"Invalid input var")},wh=(t,e)=>{let{epsilon:r,spatial:n,format:o}=e,i=t[0].dims,s=n?fe(i[i.length-1]):1,u=o==="NHWC"&&i.length>1?s:1,d=k.size(i)/s,c=n,p=c?i.length:i,m=O("x",t[0].dataType,t[0].dims,s),g=O("scale",t[1].dataType,t[1].dims,u),y=O("bias",t[2].dataType,t[2].dims,u),b=O("inputMean",t[3].dataType,t[3].dims,u),w=O("inputVar",t[4].dataType,t[4].dims,u),S=R("y",t[0].dataType,p,s),x=()=>{let T="";if(n)T=`let cOffset = ${i.length===1?"0u":o==="NHWC"?`outputIndices[${i.length-1}] / ${s}`:"outputIndices[1]"};`;else if(o==="NCHW")T=`
            ${S.indicesSet("outputIndices","0","0")}
            let cOffset = ${S.indicesToOffset("outputIndices")};`;else{T=`var cIndices = ${g.type.indices}(0);
                       cIndices[0] = outputIndices[${i.length-1}];`;for(let I=1;I<g.rank;I++)T+=`cIndices[${I}] = outputIndices[${I}];`;T+=`let cOffset = ${g.indicesToOffset("cIndices")};`}return T},$=T=>`
  const epsilon = ${r};
  ${T.registerUniform("outputSize","u32").declareVariables(m,g,y,b,w,S)}
  ${T.mainStart()}
  ${T.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
    var outputIndices = ${S.offsetToIndices(`global_idx * ${s}`)};
    ${x()}
    let scale = ${g.getByOffset("cOffset")};
    let bias = ${y.getByOffset("cOffset")};
    let inputMean = ${b.getByOffset("cOffset")};
    let inputVar = ${w.getByOffset("cOffset")};
    let x = ${m.getByOffset("global_idx")};
    let value = (x - inputMean) * inverseSqrt(inputVar + epsilon) * scale + bias;
    ${S.setByOffset("global_idx","value")}
  }`;return{name:"BatchNormalization",shaderCache:{hint:`${e.epsilon}_${e.format}_${n}_${s}`,inputDependencies:c?["rank","type","type","type","type"]:void 0},getShaderSource:$,getRunData:()=>({outputs:[{dims:t[0].dims,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(d/64)},programUniforms:c?[{type:12,data:d},...L(i)]:[{type:12,data:d}]})}},_h=t=>ee(t),wu=(t,e)=>{let{inputs:r,outputCount:n}=t,o=_h({...e,outputCount:n});if(be.webgpu.validateInputContent&&yh(r,o),e.trainingMode)throw new Error("BatchNormalization trainingMode is not supported yet.");t.compute(wh(r,o))}});var vh,$h,vu,$u=V(()=>{"use strict";ne();ae();vh=t=>{if(t[0].dims.length!==3)throw new Error("input should have 3 dimensions");if(![320,640,1280].includes(t[0].dims[2]))throw new Error("number of channels should be 320, 640 or 1280");if(t[1].dims.length!==1)throw new Error("bias is expected to have 1 dimensions");if(t[0].dims[2]!==t[1].dims[0])throw new Error("last dimension of input and bias are not the same")},$h=t=>{let e=t[0].dims,r=t[0].dims[2],n=k.size(e)/4,o=t[0].dataType,i=O("input",o,e,4),s=O("bias",o,[r],4),u=O("residual",o,e,4),d=R("output",o,e,4);return{name:"BiasAdd",getRunData:()=>({outputs:[{dims:e,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(n/64)}}),getShaderSource:p=>`
  const channels = ${r}u / 4;
  ${p.declareVariables(i,s,u,d)}

  ${p.mainStart()}
    ${p.guardAgainstOutOfBoundsWorkgroupSizes(n)}
    let value = ${i.getByOffset("global_idx")}
      + ${s.getByOffset("global_idx % channels")} + ${u.getByOffset("global_idx")};
    ${d.setByOffset("global_idx","value")}
  }`}},vu=t=>{vh(t.inputs),t.compute($h(t.inputs))}});var xh,he,xu,Su,Tu,Iu,Cu,Au,Eu,ku,Pu,Sh,Ou,zu,Du,Bu,nr,Mu,tn,Ru,Uu,Nu,Vu,Lu,Wu,Gu,Hu,Fu,qu,Ku,ju,Zu,Qu,Yu,Xu,Ju,ed,yo,wo,td,rd,nd,Th,Ih,od,rn=V(()=>{"use strict";J();ne();Ie();ae();xh=(t,e,r,n,o,i,s)=>{let u=Math.ceil(e/4),d="";typeof o=="string"?d=`${o}(a)`:d=o("a");let c=O("inputData",r,[u],4),p=R("outputData",n,[u],4),m=[{name:"vec_size",type:"u32"}];return s&&m.push(...s),`
      ${t.registerUniforms(m).declareVariables(c,p)}

  ${i??""}

  ${t.mainStart()}
    ${t.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}

    let a = ${c.getByOffset("global_idx")};
    ${p.setByOffset("global_idx",d)}
  }`},he=(t,e,r,n,o,i=t.dataType,s,u)=>{let d=[{type:12,data:Math.ceil(k.size(t.dims)/4)}];return s&&d.push(...s),{name:e,shaderCache:{hint:o,inputDependencies:["type"]},getShaderSource:c=>xh(c,k.size(t.dims),t.dataType,i,r,n,u),getRunData:c=>({outputs:[{dims:t.dims,dataType:i}],dispatchGroup:{x:Math.ceil(k.size(c[0].dims)/64/4)},programUniforms:d})}},xu=t=>{t.compute(he(t.inputs[0],"Abs","abs"))},Su=t=>{t.compute(he(t.inputs[0],"Acos","acos"))},Tu=t=>{t.compute(he(t.inputs[0],"Acosh","acosh"))},Iu=t=>{t.compute(he(t.inputs[0],"Asin","asin"))},Cu=t=>{t.compute(he(t.inputs[0],"Asinh","asinh"))},Au=t=>{t.compute(he(t.inputs[0],"Atan","atan"))},Eu=t=>{t.compute(he(t.inputs[0],"Atanh","atanh"))},ku=t=>ee(t),Pu=(t,e)=>{let r;switch(e.to){case 10:r="vec4<f16>";break;case 1:r="vec4<f32>";break;case 12:r="vec4<u32>";break;case 6:r="vec4<i32>";break;case 9:r="vec4<bool>";break;default:throw new RangeError(`not supported type (specified in attribute 'to' from 'Cast' operator): ${e.to}`)}t.compute(he(t.inputs[0],"Cast",r,void 0,e.cacheKey,e.to))},Sh=t=>{let e,r,n=t.length>=2&&t[1].data!==0,o=t.length>=3&&t[2].data!==0;switch(t[0].dataType){case 1:e=n?t[1].getFloat32Array()[0]:-34028234663852886e22,r=o?t[2].getFloat32Array()[0]:34028234663852886e22;break;case 10:e=n?t[1].getUint16Array()[0]:64511,r=o?t[2].getUint16Array()[0]:31743;break;default:throw new Error("Unsupport data type")}return ee({min:e,max:r})},Ou=(t,e)=>{let r=e||Sh(t.inputs),n=Pe(t.inputs[0].dataType);t.compute(he(t.inputs[0],"Clip",o=>`clamp(${o}, vec4<${n}>(uniforms.min), vec4<${n}>(uniforms.max))`,void 0,r.cacheKey,void 0,[{type:t.inputs[0].dataType,data:r.min},{type:t.inputs[0].dataType,data:r.max}],[{name:"min",type:n},{name:"max",type:n}]),{inputs:[0]})},zu=t=>{t.compute(he(t.inputs[0],"Ceil","ceil"))},Du=t=>{t.compute(he(t.inputs[0],"Cos","cos"))},Bu=t=>{t.compute(he(t.inputs[0],"Cosh","cosh"))},nr=t=>ee(t),Mu=(t,e)=>{let r=Pe(t.inputs[0].dataType);t.compute(he(t.inputs[0],"Elu",n=>`elu_vf32(${n})`,`
  const elu_alpha_ = ${r}(${e.alpha});

  fn elu_f32(a: ${r}) -> ${r} {
  return select((exp(a) - 1.0) * elu_alpha_, a, a >= 0.0);
  }

  fn elu_vf32(v: vec4<${r}>) -> vec4<${r}> {
  return vec4(elu_f32(v.x), elu_f32(v.y), elu_f32(v.z), elu_f32(v.w));
  }`,e.cacheKey))},tn=(t="f32")=>`
const r0: ${t} = 0.3275911;
const r1: ${t} = 0.254829592;
const r2: ${t} = -0.284496736;
const r3: ${t} = 1.421413741;
const r4: ${t} = -1.453152027;
const r5: ${t} = 1.061405429;

fn erf_vf32(v: vec4<${t}>) -> vec4<${t}> {
  let absv = abs(v);
  let x = 1.0 / (1.0 + r0 * absv);
  return sign(v) * (1.0 - ((((r5 * x + r4) * x + r3) * x + r2) * x + r1) * x * exp(-absv * absv));
}`,Ru=t=>{let e=Pe(t.inputs[0].dataType);t.compute(he(t.inputs[0],"Erf",r=>`erf_vf32(${r})`,tn(e)))},Uu=t=>{t.compute(he(t.inputs[0],"Exp","exp"))},Nu=t=>{t.compute(he(t.inputs[0],"Floor","floor"))},Vu=t=>{let e=Pe(t.inputs[0].dataType);t.compute(he(t.inputs[0],"Gelu",r=>`0.5 * ${r} * (1.0 + erf_vf32(${r} * 0.7071067811865475))`,tn(e)))},Lu=(t,e)=>{let r=Pe(t.inputs[0].dataType);t.compute(he(t.inputs[0],"LeakyRelu",n=>`select(leaky_relu_alpha_ * ${n}, ${n}, ${n} >= vec4<${r}>(0.0))`,`const leaky_relu_alpha_ = ${r}(${e.alpha});`,e.cacheKey))},Wu=t=>{t.compute(he(t.inputs[0],"Not",e=>`!${e}`))},Gu=t=>{t.compute(he(t.inputs[0],"Neg",e=>`-${e}`))},Hu=t=>{t.compute(he(t.inputs[0],"Reciprocal",e=>`1.0/${e}`))},Fu=t=>{let e=Pe(t.inputs[0].dataType);t.compute(he(t.inputs[0],"Relu",r=>`select(vec4<${e}>(0.0), ${r}, ${r} > vec4<${e}>(0.0))`))},qu=t=>{t.compute(he(t.inputs[0],"Sigmoid",e=>`(1.0 / (1.0 + exp(-${e})))`))},Ku=t=>ee(t),ju=(t,e)=>{let r=Pe(t.inputs[0].dataType);t.compute(he(t.inputs[0],"HardSigmoid",n=>`max(vec4<${r}>(0.0), min(vec4<${r}>(1.0), ${e.alpha} * ${n} + vec4<${r}>(${e.beta})))`,void 0,e.cacheKey))},Zu=t=>{t.compute(he(t.inputs[0],"Sin","sin"))},Qu=t=>{t.compute(he(t.inputs[0],"Sinh","sinh"))},Yu=t=>{t.compute(he(t.inputs[0],"Sqrt","sqrt"))},Xu=t=>{t.compute(he(t.inputs[0],"Tan","tan"))},Ju=t=>`sign(${t}) * (1 - exp(-2 * abs(${t}))) / (1 + exp(-2 * abs(${t})))`,ed=t=>{t.compute(he(t.inputs[0],"Tanh",Ju))},yo=(t="f32")=>`
const fast_gelu_a: ${t} = 0.5;
const fast_gelu_b: ${t} = 0.7978845608028654;
const fast_gelu_c: ${t} = 0.035677408136300125;

fn tanh_v(v: vec4<${t}>) -> vec4<${t}> {
  return ${Ju("v")};
}
`,wo=t=>`(fast_gelu_a + fast_gelu_a * tanh_v(${t} * (fast_gelu_c * ${t} * ${t} + fast_gelu_b))) * ${t}`,td=t=>{let e=Pe(t.inputs[0].dataType);t.compute(he(t.inputs[0],"FastGelu",wo,yo(e),void 0,t.inputs[0].dataType))},rd=(t,e)=>{let r=Pe(t.inputs[0].dataType);return t.compute(he(t.inputs[0],"ThresholdedRelu",n=>`select(vec4<${r}>(0.0), ${n}, ${n} > thresholded_relu_alpha_)`,`const thresholded_relu_alpha_ = vec4<${r}>(${e.alpha});`,e.cacheKey)),0},nd=t=>{t.compute(he(t.inputs[0],"Log","log"))},Th=(t,e)=>`
const alpha = vec4<${t}>(${e});
const one = ${t}(1.0);
const zero = ${t}(0.0);

fn quick_gelu_impl(x: vec4<${t}>) -> vec4<${t}> {
  let v = x *alpha;
  var x1 : vec4<${t}>;
  for (var i = 0; i < 4; i = i + 1) {
    if (v[i] >= zero) {
      x1[i] = one / (one + exp(-v[i]));
    } else {
      x1[i] = one - one / (one + exp(v[i]));
    }
  }
  return x * x1;
}
`,Ih=t=>`quick_gelu_impl(${t})`,od=(t,e)=>{let r=Pe(t.inputs[0].dataType);t.compute(he(t.inputs[0],"QuickGelu",Ih,Th(r,e.alpha),e.cacheKey,t.inputs[0].dataType))}});var Ch,Ah,ad,sd=V(()=>{"use strict";ne();ae();rn();Ch=t=>{if(t[0].dims.length!==3)throw new Error("input should have 3 dimensions");if(![2560,5120,10240].includes(t[0].dims[2]))throw new Error("hidden state should be 2560, 5120 or 10240");if(t[1].dims.length!==1)throw new Error("bias is expected to have 1 dimensions");if(t[0].dims[2]!==t[1].dims[0])throw new Error("last dimension of input and bias are not the same")},Ah=t=>{let e=t[0].dims.slice();e[2]=e[2]/2;let r=O("input",t[0].dataType,t[0].dims,4),n=O("bias",t[0].dataType,[t[0].dims[2]],4),o=R("output",t[0].dataType,e,4),i=k.size(e)/4,s=ye(t[0].dataType);return{name:"BiasSplitGelu",getRunData:()=>({outputs:[{dims:e,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(i/64)}}),getShaderSource:d=>`
  const M_SQRT2 = sqrt(2.0);
  const halfChannels = ${t[0].dims[2]/4/2}u;

  ${d.declareVariables(r,n,o)}

  ${tn(s)}

  ${d.mainStart()}
    ${d.guardAgainstOutOfBoundsWorkgroupSizes(i)}
    let biasIdx = global_idx % halfChannels;
    let batchIndex = global_idx / halfChannels;
    let inputOffset = biasIdx + batchIndex * halfChannels * 2;
    let valueLeft = input[inputOffset] + bias[biasIdx];
    let valueRight = input[inputOffset + halfChannels] + bias[biasIdx + halfChannels];
    let geluRight = valueRight * 0.5 * (erf_vf32(valueRight / M_SQRT2) + 1);

    ${o.setByOffset("global_idx","valueLeft * geluRight")}
  }`}},ad=t=>{Ch(t.inputs),t.compute(Ah(t.inputs))}});var Eh,kh,dt,ud,dd,ld,cd,pd,md,fd,hd,gd,bd,yd=V(()=>{"use strict";J();ne();ae();Eh=(t,e,r,n,o,i,s,u,d,c,p,m)=>{let g,y;typeof u=="string"?g=y=($,T)=>`${u}((${$}),(${T}))`:typeof u=="function"?g=y=u:(g=u.scalar,y=u.vector);let b=R("outputData",p,n.length,4),w=O("aData",d,e.length,4),S=O("bData",c,r.length,4),x;if(o)if(i){let $=k.size(e)===1,T=k.size(r)===1,I=e.length>0&&e[e.length-1]%4===0,E=r.length>0&&r[r.length-1]%4===0;$||T?x=b.setByOffset("global_idx",y($?`${w.type.value}(${w.getByOffset("0")}.x)`:w.getByOffset("global_idx"),T?`${S.type.value}(${S.getByOffset("0")}.x)`:S.getByOffset("global_idx"))):x=`
            let outputIndices = ${b.offsetToIndices("global_idx * 4u")};
            let offsetA = ${w.broadcastedIndicesToOffset("outputIndices",b)};
            let offsetB = ${S.broadcastedIndicesToOffset("outputIndices",b)};
            ${b.setByOffset("global_idx",y(s||I?w.getByOffset("offsetA / 4u"):`${w.type.value}(${w.getByOffset("offsetA / 4u")}[offsetA % 4u])`,s||E?S.getByOffset("offsetB / 4u"):`${S.type.value}(${S.getByOffset("offsetB / 4u")}[offsetB % 4u])`))}
          `}else x=b.setByOffset("global_idx",y(w.getByOffset("global_idx"),S.getByOffset("global_idx")));else{if(!i)throw new Error("no necessary to use scalar implementation for element-wise binary op implementation.");let $=(T,I,E="")=>{let A=`aData[indexA${I}][componentA${I}]`,z=`bData[indexB${I}][componentB${I}]`;return`
            let outputIndices${I} = ${b.offsetToIndices(`global_idx * 4u + ${I}u`)};
            let offsetA${I} = ${w.broadcastedIndicesToOffset(`outputIndices${I}`,b)};
            let offsetB${I} = ${S.broadcastedIndicesToOffset(`outputIndices${I}`,b)};
            let indexA${I} = offsetA${I} / 4u;
            let indexB${I} = offsetB${I} / 4u;
            let componentA${I} = offsetA${I} % 4u;
            let componentB${I} = offsetB${I} % 4u;
            ${T}[${I}] = ${E}(${g(A,z)});
          `};p===9?x=`
            var data = vec4<u32>(0);
            ${$("data",0,"u32")}
            ${$("data",1,"u32")}
            ${$("data",2,"u32")}
            ${$("data",3,"u32")}
            outputData[global_idx] = dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(data));`:x=`
            ${$("outputData[global_idx]",0)}
            ${$("outputData[global_idx]",1)}
            ${$("outputData[global_idx]",2)}
            ${$("outputData[global_idx]",3)}
          `}return`
        ${t.registerUniform("vec_size","u32").declareVariables(w,S,b)}

        ${m??""}

        ${t.mainStart()}
        ${t.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
        ${x}
      }`},kh=(t,e,r,n,o,i,s=r.dataType)=>{let u=r.dims.map(Number),d=n.dims.map(Number),c=!k.areEqual(u,d),p=u,m=k.size(u),g=!1,y=!1,b=[c];if(c){let w=ot.calcShape(u,d,!1);if(!w)throw new Error("Can't perform binary op on the given tensors");p=w.slice(),m=k.size(p);let S=k.size(u)===1,x=k.size(d)===1,$=u.length>0&&u[u.length-1]%4===0,T=d.length>0&&d[d.length-1]%4===0;b.push(S),b.push(x),b.push($),b.push(T);let I=1;for(let E=1;E<p.length;E++){let A=u[u.length-E],z=d[d.length-E];if(A===z)I*=A;else break}I%4===0?(y=!0,g=!0):(S||x||$||T)&&(g=!0)}else g=!0;return b.push(g),{name:t,shaderCache:{hint:e+b.map(w=>w.toString()).join("_"),inputDependencies:["rank","rank"]},getShaderSource:w=>Eh(w,u,d,p,g,c,y,o,r.dataType,n.dataType,s,i),getRunData:()=>({outputs:[{dims:p,dataType:s}],dispatchGroup:{x:Math.ceil(m/64/4)},programUniforms:[{type:12,data:Math.ceil(k.size(p)/4)},...L(u,d,p)]})}},dt=(t,e,r,n,o,i)=>{t.compute(kh(e,o??"",t.inputs[0],t.inputs[1],r,n,i))},ud=t=>{dt(t,"Add",(e,r)=>`${e}+${r}`)},dd=t=>{dt(t,"Div",(e,r)=>`${e}/${r}`)},ld=t=>{dt(t,"Equal",{scalar:(e,r)=>`u32(${e}==${r})`,vector:(e,r)=>`vec4<u32>(${e}==${r})`},void 0,void 0,9)},cd=t=>{dt(t,"Mul",(e,r)=>`${e}*${r}`)},pd=t=>{let e=O("input",t.inputs[0].dataType,t.inputs[0].dims).type.value;dt(t,"Pow",{scalar:(n,o)=>`pow_custom(${n},${o})`,vector:(n,o)=>`pow_vector_custom(${n},${o})`},`
    fn pow_custom(a : ${e}, b : ${e}) -> ${e} {
      if (b == ${e}(0.0)) {
        return ${e}(1.0);
      } else if (a < ${e}(0.0) && f32(b) != floor(f32(b))) {
        return ${e}(pow(f32(a), f32(b))); // NaN
      }
      return select(sign(a), ${e}(1.0), round(f32(abs(b) % ${e}(2.0))) != 1.0) * ${e}(${e==="i32"?"round":""}(pow(f32(abs(a)), f32(b))));
    }
    fn pow_vector_custom(a : vec4<${e}>, b : vec4<${e}>) -> vec4<${e}> {
      // TODO: implement vectorized pow
      return vec4<${e}>(pow_custom(a.x, b.x), pow_custom(a.y, b.y), pow_custom(a.z, b.z), pow_custom(a.w, b.w));
    }
      `)},md=t=>{dt(t,"Sub",(e,r)=>`${e}-${r}`)},fd=t=>{dt(t,"Greater",{scalar:(e,r)=>`u32(${e}>${r})`,vector:(e,r)=>`vec4<u32>(${e}>${r})`},void 0,void 0,9)},hd=t=>{dt(t,"Less",{scalar:(e,r)=>`u32(${e}<${r})`,vector:(e,r)=>`vec4<u32>(${e}<${r})`},void 0,void 0,9)},gd=t=>{dt(t,"GreaterOrEqual",{scalar:(e,r)=>`u32(${e}>=${r})`,vector:(e,r)=>`vec4<u32>(${e}>=${r})`},void 0,void 0,9)},bd=t=>{dt(t,"LessOrEqual",{scalar:(e,r)=>`u32(${e}<=${r})`,vector:(e,r)=>`vec4<u32>(${e}<=${r})`},void 0,void 0,9)}});var Oh,zh,Dh,Bh,wd,_d,vd=V(()=>{"use strict";J();ne();Ie();ae();Oh=(t,e)=>{if(!t||t.length<1)throw new Error("too few inputs");let r=0,n=t[r],o=n.dataType,i=n.dims.length;t.forEach((s,u)=>{if(u!==r){if(s.dataType!==o)throw new Error("input tensors should be one type");if(s.dims.length!==i)throw new Error("input tensors should have the same shape");s.dims.forEach((d,c)=>{if(c!==e&&d!==n.dims[c])throw new Error("non concat dimensions must match")})}})},zh=(t,e)=>`
  fn calculateInputIndex(index: u32) -> u32 {
    let sizeInConcatAxis = array<u32, ${t}u>(${e});
    for (var i: u32 = 0u; i < ${t}; i += 1u ) {
      if (index < sizeInConcatAxis[i]) {
        return i;
      }
    }
    return ${t}u;
  }`,Dh=(t,e)=>{let r=t.length,n=[];for(let o=0;o<r;++o){let i=e.setByOffset("global_idx",t[o].getByIndices("indices"));r===1?n.push(i):o===0?n.push(`if (inputIndex == ${o}u) { ${i} }`):o===r-1?n.push(`else { ${i} }`):n.push(`else if (inputIndex == ${o}) { ${i} }`)}return n.join(`
`)},Bh=(t,e,r,n)=>{let o=k.size(r),i=new Array(t.length),s=new Array(t.length),u=0,d=[],c=[],p=[{type:12,data:o}];for(let w=0;w<t.length;++w)u+=t[w].dims[e],i[w]=u,c.push(t[w].dims.length),s[w]=O(`input${w}`,n,c[w]),d.push("rank"),p.push({type:12,data:i[w]});for(let w=0;w<t.length;++w)p.push(...L(t[w].dims));p.push(...L(r));let m=R("output",n,r.length),g=m.indicesGet("indices",e),y=Array.from(Array(i.length).keys()).map(w=>`uniforms.sizeInConcatAxis${w}`).join(","),b=w=>`

  ${(()=>{w.registerUniform("outputSize","u32");for(let S=0;S<t.length;S++)w.registerUniform(`sizeInConcatAxis${S}`,"u32");return w.declareVariables(...s,m)})()}

  ${zh(i.length,y)}

  ${w.mainStart()}
    ${w.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

    var indices = ${m.offsetToIndices("global_idx")};

    let inputIndex = calculateInputIndex(${g});
    if (inputIndex != 0u) {
      let sizeInConcatAxis = array<u32, ${i.length}u>(${y});
      ${g} -= sizeInConcatAxis[inputIndex - 1u];
    }

    ${Dh(s,m)}
  }`;return{name:"Concat",shaderCache:{hint:`${e}`,inputDependencies:d},getRunData:()=>({outputs:[{dims:r,dataType:n}],dispatchGroup:{x:Math.ceil(o/64)},programUniforms:p}),getShaderSource:b}},wd=(t,e)=>{let r=t.inputs,n=r[0].dims,o=k.normalizeAxis(e.axis,n.length);Oh(r,o);let i=n.slice();i[o]=r.reduce((u,d)=>u+(d.dims.length>o?d.dims[o]:0),0);let s=r.filter(u=>k.size(u.dims)>0);t.compute(Bh(s,o,i,r[0].dataType),{inputs:s})},_d=t=>ee({axis:t.axis})});var Ze,Qe,Ye,nn,St=V(()=>{"use strict";J();ne();Ze=(t,e,r="f32")=>{switch(t.activation){case"Relu":return`value = max(value, ${e}(0.0));`;case"Sigmoid":return`value = (${e}(1.0) / (${e}(1.0) + exp(-value)));`;case"Clip":return`value = clamp(value, ${e}(${r}(uniforms.clip_min)), ${e}(${r}(uniforms.clip_max)));`;case"HardSigmoid":return`value = max(${e}(0.0), min(${e}(1.0), ${r}(uniforms.alpha) * value + ${r}(uniforms.beta)));`;case"LeakyRelu":return`value = select(${r}(uniforms.alpha) * value, value, value >= ${e}(0.0));`;case"Tanh":return`let e2x = exp(-2.0 * abs(value));
              value = sign(value) * (1.0 - e2x) / (1.0 + e2x);
        `;case"":return"";default:throw new Error(`Unsupported activation ${t.activation}`)}},Qe=(t,e)=>{t.activation==="Clip"?e.push({type:1,data:t.clipMax},{type:1,data:t.clipMin}):t.activation==="HardSigmoid"?e.push({type:1,data:t.alpha},{type:1,data:t.beta}):t.activation==="LeakyRelu"&&e.push({type:1,data:t.alpha})},Ye=(t,e)=>{t.activation==="Clip"?e.push({name:"clip_max",type:"f32"},{name:"clip_min",type:"f32"}):t.activation==="HardSigmoid"?e.push({name:"alpha",type:"f32"},{name:"beta",type:"f32"}):t.activation==="LeakyRelu"&&e.push({name:"alpha",type:"f32"})},nn=t=>{let e=t?.activation||"";if(e==="HardSigmoid"){let[r,n]=t?.activation_params||[.2,.5];return{activation:e,alpha:r,beta:n}}else if(e==="Clip"){let[r,n]=t?.activation_params||[As,Es];return{activation:e,clipMax:n,clipMin:r}}else if(e==="LeakyRelu"){let[r]=t?.activation_params||[.01];return{activation:e,alpha:r}}return{activation:e}}});var Ee,$d,on=V(()=>{"use strict";Ee=(t,e)=>{switch(t){case 1:return e;case 2:return`vec2<${e}>`;case 3:return`vec3<${e}>`;case 4:return`vec4<${e}>`;default:throw new Error(`${t}-component is not supported.`)}},$d=t=>`
      ${t?"value = value + getBiasByOutputCoords(coords);":""}
      `});var xd,Sd=V(()=>{"use strict";xd=t=>`
fn getIndexFromCoords4D(coords : vec4<i32>, shape : vec4<i32>) -> i32 {
  return dot(coords, vec4<i32>(
      shape.y * shape.z * shape.w, shape.z * shape.w, shape.w, 1));
}
fn getOutputIndexFromCoords(coords : vec4<i32>) -> i32 {
  return dot(coords, vec4<i32>(
    i32(${t}.x), i32(${t}.y), i32(${t}.z), 1));
}
`});var or,an,sn=V(()=>{"use strict";J();ne();ae();St();or=(t,e,r,n,o)=>{let i=n-r;return`
      ${Array.from({length:r}).map((s,u)=>`
      if (${F(e.shape,u,e.rank)} != 1) {
        ${e.indicesSet(t,u,F(o,u+i,n))}
      } else {
        ${e.indicesSet(t,u,0)}
      }`).join("")}
`},an=(t,e,r,n,o=!1,i)=>{let s=t[0].dims,u=t[1].dims,d=s[s.length-2],c=u[u.length-1],p=s[s.length-1],m=fe(c),g=fe(p),y=fe(d),b=k.size(r)/m/y,w=t.length>2,S=n?n.slice(0,-2):r.slice(0,-2),$=[k.size(S),d,c],T=[{type:12,data:b},{type:12,data:d},{type:12,data:c},{type:12,data:p}];Qe(e,T),T.push(...L(S,s,u)),w&&T.push(...L(t[2].dims)),T.push(...L($));let I=E=>{let A=Yr("batch_dims",t[0].dataType,S.length),z=O("a",t[0].dataType,s.length,g),v=O("b",t[1].dataType,u.length,m),M=R("output",t[0].dataType,$.length,m),N=ye(M.type.tensor),K=Ze(e,M.type.value,N),q=[z,v],Q="";if(w){let j=o?m:1;q.push(O("bias",t[2].dataType,t[2].dims.length,j)),Q=`${o?`value += bias[col / ${j}];`:`value += ${M.type.value}(bias[row + i]);`}`}let D=[{name:"output_size",type:"u32"},{name:"M",type:"u32"},{name:"N",type:"u32"},{name:"K",type:"u32"}];Ye(e,D);let W=()=>{let j=`var a_data: ${z.type.value};`;for(let Y=0;Y<g;Y++)j+=`
              let b_data${Y} = b[(b_offset + (k + ${Y}) * uniforms.N + col) / ${m}];`;for(let Y=0;Y<y;Y++){j+=`a_data = a[(a_offset + (row + ${Y}) * uniforms.K + k) / ${g}];`;for(let Z=0;Z<g;Z++)j+=`
            values[${Y}] = fma(${v.type.value}(a_data${g===1?"":`[${Z}]`}), b_data${Z}, values[${Y}]);
`}return j};return`
  ${E.registerUniforms(D).registerInternalVariables(A).declareVariables(...q,M)}
  ${E.mainStart()}
    ${E.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let col = (global_idx % (uniforms.N / ${m})) * ${m};
    var index1 = global_idx / (uniforms.N / ${m});
    let stride1 = uniforms.M / ${y};
    let row = (index1 % stride1) * ${y};
    let batch = index1 / stride1;

    ${r.length===2?"":`let batch_indices = ${A.offsetToIndices("batch")};`}

    var a_indices: ${z.type.indices};
    ${or("a_indices",z,z.rank-2,A.rank,"batch_indices")}
    ${z.indicesSet("a_indices",z.rank-2,0)}
    ${z.indicesSet("a_indices",z.rank-1,0)}
    let a_offset = ${z.indicesToOffset("a_indices")};

    var b_indices: ${v.type.indices};
    ${or("b_indices",v,v.rank-2,A.rank,"batch_indices")}
    ${v.indicesSet("b_indices",v.rank-2,0)}
    ${v.indicesSet("b_indices",v.rank-1,0)}
    let b_offset = ${v.indicesToOffset("b_indices")};
    var values: array<${M.type.value}, ${y}>;
    for (var k: u32 = 0u; k < uniforms.K; k = k + ${g}) {
      ${W()}
    }
    for (var i = 0u; i < ${y}u; i++) {
      var value = values[i];
      ${Q}
      ${K}
      let cur_indices = ${M.type.indices}(batch, row + i, col);
      let offset = ${M.indicesToOffset("cur_indices")};
      ${M.setByOffset(`offset / ${m}`,"value")};
    }
  }
  `};return{name:"MatMulNaive",shaderCache:{hint:`${e.activation};${m};${g};${y};${o}`,inputDependencies:w?["rank","rank","rank"]:["rank","rank"]},getRunData:()=>({outputs:[{dims:i?i(r):r,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(b/64)},programUniforms:T}),getShaderSource:I}}});var Mh,Rh,_o,Td,Uh,vo,Nh,ir,un=V(()=>{"use strict";J();ne();ae();St();sn();on();Mh=(t,e)=>t?`
        mm_Asub[inputRow][inputCol] = mm_readA(batch,
          kStart + inputRow,
          globalRowStart / innerElementSize + inputCol${e?", batchIndices":""});
        `:`
        mm_Asub[inputRow][inputCol] = mm_readA(batch,
          globalRow + innerRow,
          kStart / innerElementSize + inputCol${e?", batchIndices":""});
        `,Rh=(t,e)=>t?`
        let ACached0 = mm_Asub[k * innerElementSize][localRow];
        let ACached1 = mm_Asub[k * innerElementSize + 1][localRow];
        let ACached2 = mm_Asub[k * innerElementSize + 2][localRow];
        ${e===3?"":"let ACached3 = mm_Asub[k * innerElementSize + 3][localRow];"}
        for (var i = 0; i < rowPerThread; i = i + 1) {
          acc[i] = BCached0 * ACached0[i] + acc[i];
          acc[i] = BCached1 * ACached1[i] + acc[i];
          acc[i] = BCached2 * ACached2[i] + acc[i];
          ${e===3?"":"acc[i] = BCached3 * ACached3[i] + acc[i];"}
        }`:`
        for (var i = 0; i < rowPerThread; i = i + 1) {
          let ACached = mm_Asub[tileRow + i][k];
          acc[i] = BCached0 * ACached.x + acc[i];
          acc[i] = BCached1 * ACached.y + acc[i];
          acc[i] = BCached2 * ACached.z + acc[i];
          ${e===3?"":"acc[i] = BCached3 * ACached.w + acc[i];"}
        }`,_o=(t,e,r="f32",n,o=!1,i=32,s=!1,u=32)=>{let d=e[1]*t[1],c=e[0]*t[0],p=o?d:i,m=o?i:d,g=p/e[0],y=i/e[1];if(!((o&&g===4&&t[1]===4||!o&&(g===3||g===4))&&p%e[0]===0&&i%e[1]===0&&t[0]===4))throw new Error(`If transposeA ${o} is true, innerElementSize ${g} and workPerThread[1] ${t[1]} must be 4.
      Otherwise, innerElementSize ${g} must be 3 or 4.
  tileAWidth ${p} must be divisible by workgroupSize[0]${e[0]}. tileInner ${i} must be divisible by workgroupSize[1] ${e[1]}. colPerThread ${t[0]} must be 4.`);return`
var<workgroup> mm_Asub: array<array<vec${g}<${r}>, ${p/g}>, ${m}>;
var<workgroup> mm_Bsub: array<array<vec4<${r}>, ${c/t[0]}>, ${i}>;

const rowPerThread = ${t[1]};
const colPerThread = ${t[0]};
const innerElementSize = ${g};
const tileInner = ${i};

@compute @workgroup_size(${e[0]}, ${e[1]}, ${e[2]})
fn main(@builtin(local_invocation_id) localId : vec3<u32>,
        @builtin(global_invocation_id) globalId : vec3<u32>,
        @builtin(workgroup_id) workgroupId : vec3<u32>) {
  let localRow = i32(localId.y);
  let tileRow = localRow * rowPerThread;
  let tileCol = i32(localId.x);

  let globalRow =i32(globalId.y) * rowPerThread;
  let globalCol = i32(globalId.x);
  let batch = ${s?"0":"i32(globalId.z)"};
  ${n?`let batchIndices = ${n.offsetToIndices("u32(batch)")};`:""}
  let globalRowStart = i32(workgroupId.y) * ${d};

  let num_tiles = ${s?`${Math.ceil(u/i)}`:"(uniforms.dim_inner - 1) / tileInner + 1"};
  var kStart = ${s?`i32(globalId.z) * ${u}`:"0"};

  var acc: array<vec4<${r}>, rowPerThread>;

  // Loop over shared dimension.
  let tileRowB = localRow * ${y};
  for (var t = 0; t < num_tiles; t = t + 1) {
      // Load one tile of A into local memory.
      for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
          let inputRow = tileRow + innerRow;
          let inputCol = tileCol;
          ${Mh(o,n)}
      }

      // Load one tile of B into local memory.
      for (var innerRow = 0; innerRow < ${y}; innerRow = innerRow + 1) {
          let inputRow = tileRowB + innerRow;
          let inputCol = tileCol;
          mm_Bsub[inputRow][inputCol] = mm_readB(batch, kStart + inputRow, globalCol${n?", batchIndices":""});
      }
      kStart = kStart + tileInner;
      workgroupBarrier();

      // Compute acc values for a single thread.
      for (var k = 0; k < tileInner / innerElementSize; k = k + 1) {
          let BCached0 = mm_Bsub[k * innerElementSize][tileCol];
          let BCached1 = mm_Bsub[k * innerElementSize + 1][tileCol];
          let BCached2 = mm_Bsub[k * innerElementSize + 2][tileCol];
          ${g===3?"":"let BCached3 = mm_Bsub[k * innerElementSize + 3][tileCol];"}

          ${Rh(o,g)}
      }

      workgroupBarrier();
  }

  for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      mm_write(batch, globalRow + innerRow, globalCol, acc[innerRow]);
  }
}`},Td=(t,e)=>t?`
            mm_Asub[inputRow][inputCol] = mm_readA(batch,
              kStart + inputRow,
              globalRowStart + inputCol${e?", batchIndices":""});
            `:`
            mm_Asub[inputRow][inputCol] = mm_readA(batch,
              globalRowStart + inputRow,
              kStart + inputCol${e?", batchIndices":""});
            `,Uh=t=>t?"let ACached = mm_Asub[k][tileRow + innerRow];":"let ACached = mm_Asub[tileRow + innerRow][k];",vo=(t,e,r="f32",n,o=!1,i=32,s=!1,u=32,d=!1)=>{let c=t[1]*e[1],p=t[0]*e[0],m=o?c:i,g=o?i:c;if(!(g%e[1]===0&&m%e[0]===0&&i%e[1]===0))throw new Error(`tileAHight ${g} must be divisible by workgroupSize[1]${e[1]}, tileAWidth ${m} must be divisible by workgroupSize[0]${e[0]}, tileInner ${i} must be divisible by workgroupSize[1]${e[1]}`);let y=g/e[1],b=m/e[0],w=i/e[1],S=d?`
    let localRow = i32(localId.y);
    let localCol = i32(localId.x);
    let globalRowStart = i32(workgroupId.y) * ${c};
    let globalColStart = i32(workgroupId.x) * ${p};

    // Loop over shared dimension.
    for (var t = 0; t < num_tiles; t = t + 1) {
      // Load one tile of A into local memory.
      for (var inputRow = localRow; inputRow < ${g}; inputRow = inputRow + ${e[1]}) {
        for (var inputCol = localCol; inputCol < ${m}; inputCol = inputCol + ${e[0]}) {
          ${Td(o,n)}
        }
      }
      // Load one tile of B into local memory.
      for (var inputRow = localRow; inputRow < ${i}; inputRow = inputRow + ${e[1]}) {
            for (var inputCol = localCol; inputCol < ${p}; inputCol = inputCol + ${e[0]}) {
          mm_Bsub[inputRow][inputCol] = mm_readB(batch,
            kStart + inputRow,
            globalColStart + inputCol${n?", batchIndices":""});
        }
      }
      kStart = kStart + tileInner;
      workgroupBarrier();

      // Compute acc values for a single thread.
      var BCached : array<${r}, colPerThread>;
      for (var k = 0; k < tileInner; k = k + 1) {
        for (var inner = 0; inner < colPerThread; inner = inner + 1) {
          BCached[inner] = mm_Bsub[k][localCol + inner * ${e[0]}];
        }
        for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
          let ACached = ${o?`mm_Asub[k][localRow + innerRow * ${e[1]}];`:`mm_Asub[localRow + innerRow * ${e[1]}][k];`}
          for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
            acc[innerRow][innerCol] = acc[innerRow][innerCol] +
                ACached * BCached[innerCol];
          }
        }
      }
      workgroupBarrier();
    }
    for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      let gRow = globalRowStart + localRow + innerRow * ${e[1]};
      for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
        let gCol = globalColStart + localCol + innerCol * ${e[0]};
        mm_write(batch, gRow, gCol, acc[innerRow][innerCol]);
      }
    }
    `:`
let tileRow = i32(localId.y) * rowPerThread;
let tileCol = i32(localId.x) * colPerThread;

let globalRow = i32(globalId.y) * rowPerThread;
let globalCol = i32(globalId.x) * colPerThread;
let globalRowStart = i32(workgroupId.y) * ${c};

let tileRowA = i32(localId.y) * ${y};
let tileColA = i32(localId.x) * ${b};
let tileRowB = i32(localId.y) * ${w};
// Loop over shared dimension.
for (var t = 0; t < num_tiles; t = t + 1) {
  // Load one tile of A into local memory.
  for (var innerRow = 0; innerRow < ${y}; innerRow = innerRow + 1) {
    for (var innerCol = 0; innerCol < ${b}; innerCol = innerCol + 1) {
      let inputRow = tileRowA + innerRow;
      let inputCol = tileColA + innerCol;
      ${Td(o,n)}
    }
  }

  // Load one tile of B into local memory.
  for (var innerRow = 0; innerRow < ${w}; innerRow = innerRow + 1) {
    for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
      let inputRow = tileRowB + innerRow;
      let inputCol = tileCol + innerCol;
      mm_Bsub[inputRow][inputCol] = mm_readB(batch,
        kStart + inputRow,
        globalCol + innerCol${n?", batchIndices":""});
    }
  }
  kStart = kStart + tileInner;
  workgroupBarrier();

  // Compute acc values for a single thread.
  var BCached : array<${r}, colPerThread>;
  for (var k = 0; k < tileInner; k = k + 1) {
    for (var inner = 0; inner < colPerThread; inner = inner + 1) {
      BCached[inner] = mm_Bsub[k][tileCol + inner];
    }

    for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      ${Uh(o)}
      for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
        acc[innerRow][innerCol] = acc[innerRow][innerCol] + ACached * BCached[innerCol];
      }
    }
  }

  workgroupBarrier();
}

for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
  for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
    mm_write(batch, globalRow + innerRow, globalCol + innerCol,
        acc[innerRow][innerCol]);
  }
}
`;return`
  var<workgroup> mm_Asub : array<array<${r}, ${m}>, ${g}>;
  var<workgroup> mm_Bsub : array<array<${r}, ${p}>, ${i}>;
  const rowPerThread = ${t[1]};
  const colPerThread = ${t[0]};
  const tileInner = ${i};

@compute @workgroup_size(${e[0]}, ${e[1]}, ${e[2]})
fn main(@builtin(local_invocation_id) localId : vec3<u32>,
        @builtin(global_invocation_id) globalId : vec3<u32>,
        @builtin(workgroup_id) workgroupId : vec3<u32>) {
    let batch = ${s?"0":"i32(globalId.z)"};
    ${n?`let batchIndices = ${n.offsetToIndices("u32(batch)")};`:""}
    let num_tiles = ${s?`${Math.ceil(u/i)}`:"(uniforms.dim_inner - 1) / tileInner + 1"};
    var kStart = ${s?`i32(globalId.z) * ${u}`:"0"};

    var acc : array<array<${r}, colPerThread>, rowPerThread>;
    ${S}
  }
`},Nh=(t,e,r,n,o=!1)=>{let[i,s,u,d]=n,c=ye(n[0].type.tensor);return`
    fn mm_readA(batch: i32, row: i32, colIn: i32, batchIndices: ${i.type.indices}) -> ${Ee(t,c)} {
      var value = ${Ee(t,c)}(0.0);
      let col = colIn * ${t};
      if(row < uniforms.dim_a_outer && col < uniforms.dim_inner)
      {
        var aIndices: ${s.type.indices};
        ${or("aIndices",s,s.rank-2,i.rank,"batchIndices")}
        ${s.indicesSet("aIndices",s.rank-2,"u32(row)")}
        ${s.indicesSet("aIndices",s.rank-1,"u32(colIn)")}
        value = ${s.getByIndices("aIndices")};
      }
      return value;
    }

    fn mm_readB(batch: i32, row: i32, colIn: i32, batchIndices: ${i.type.indices}) -> ${Ee(t,c)} {
      var value = ${Ee(t,c)}(0.0);
      let col = colIn * ${t};
      if(row < uniforms.dim_inner && col < uniforms.dim_b_outer)
      {
        var bIndices: ${u.type.indices};
        ${or("bIndices",u,u.rank-2,i.rank,"batchIndices")}
        ${u.indicesSet("bIndices",u.rank-2,"u32(row)")}
        ${u.indicesSet("bIndices",u.rank-1,"u32(colIn)")}
        value = ${u.getByIndices("bIndices")};
      }
      return value;
    }

    fn mm_write(batch: i32, row: i32, colIn: i32, valueIn: ${Ee(t,c)}) {
      let col = colIn * ${t};
      if (row < uniforms.dim_a_outer && col < uniforms.dim_b_outer) {
        var value = valueIn;
        let coords = vec3<i32>(batch, row, colIn);
        ${e?`value = value + ${o?"bias[colIn]":`${Ee(t,c)}(bias[row])`};`:""}
        ${r}
        ${d.setByIndices("vec3<u32>(coords)","value")}
      }
    }
    `},ir=(t,e,r,n,o=!1,i)=>{let s=t[0].dims,u=t[1].dims,d=s.slice(0,-2),c=u.slice(0,-2),p=n?n.slice(0,-2):r.slice(0,-2),m=k.size(p),g=s[s.length-2],y=s[s.length-1],b=u[u.length-1],w=y%4===0&&b%4===0,S=g<=8?[4,1,1]:[4,4,1],x=[8,8,1],$=[Math.ceil(b/x[0]/S[0]),Math.ceil(g/x[1]/S[1]),Math.ceil(m/x[2]/S[2])],T=w?4:1,I=[...d,g,y/T],E=I.length,A=[...c,y,b/T],z=A.length,v=[m,g,b/T],M=[{type:6,data:g},{type:6,data:b},{type:6,data:y}];Qe(e,M),M.push(...L(p,I,A));let N=["rank","rank"],K=t.length>2;K&&(M.push(...L(t[2].dims)),N.push("rank")),M.push(...L(v));let q=Q=>{let D=p.length,W=Yr("batchDims",t[0].dataType,D,1),j=ye(t[0].dataType),Y=O("a",t[0].dataType,E,T),Z=O("b",t[1].dataType,z,T),te=R("result",t[0].dataType,v.length,T),ie=[Y,Z];if(K){let X=o?T:1;ie.push(O("bias",t[2].dataType,t[2].dims.length,X))}let we=[{name:"dim_a_outer",type:"i32"},{name:"dim_b_outer",type:"i32"},{name:"dim_inner",type:"i32"}];Ye(e,we);let Te=ye(te.type.tensor),re=Ze(e,te.type.value,Te),U=Nh(T,K,re,[W,Y,Z,te],o);return`
  ${Q.registerUniforms(we).registerInternalVariables(W).declareVariables(...ie,te)}
  ${U}
  ${w?_o(S,x,j,W):vo(S,x,j,W)}
                   `};return{name:"MatMul",shaderCache:{hint:`${S};${e.activation};${w};${o}`,inputDependencies:N},getRunData:()=>({outputs:[{dims:i?i(r):r,dataType:t[0].dataType}],dispatchGroup:{x:$[0],y:$[1],z:$[2]},programUniforms:M}),getShaderSource:q}}});var Vh,Id,Cd=V(()=>{"use strict";J();nt();ae();St();on();Sd();un();Vh=(t,e,r,n,o=!1,i,s=4,u=4,d=4,c="f32")=>{let p=N=>{switch(N){case 1:return"resData = x[xIndex];";case 3:return`resData = vec3<${c}>(x[xIndex], x[xIndex + 1], x[xIndex + 2]);`;case 4:return"resData = x[xIndex / 4];";default:throw new Error(`innerElementSize ${N} is not supported.`)}},m=N=>{switch(N){case 1:return"return w[row * i32(uniforms.w_shape[3]) + colIn];";case 4:return"return w[row * i32(uniforms.w_shape[3]) / 4 + colIn];";default:throw new Error(`innerElementSize ${N} is not supported.`)}},g=t?`
    let coord = vec4<i32>(batch, xRow, xCol, xCh);
    `:`
    let coord = vec4<i32>(batch, xCh, xRow, xCol);
    `,y=t?`
    let coords = vec4<i32>(
      batch,
      row / outWidth,
      row % outWidth,
      col);
    `:`
    let coords = vec4<i32>(
      batch,
      row,
      col / outWidth,
      col % outWidth);
    `,b=t?"i32(uniforms.x_shape[1])":"i32(uniforms.x_shape[2])",w=t?"i32(uniforms.x_shape[2])":"i32(uniforms.x_shape[3])",S=t?"row":"col",x=t?"col":"row",$=`
    let inChannels = i32(uniforms.w_shape[2]);
    let outWidth = ${t?"i32(uniforms.result_shape[2])":"i32(uniforms.result_shape[3])"};
    let outRow = ${S} / outWidth;
    let outCol = ${S} % outWidth;

    let WRow = ${x} / (i32(uniforms.w_shape[1]) * inChannels);
    let WCol = ${x} / inChannels % i32(uniforms.w_shape[1]);
    let xRow = outRow * uniforms.stride[0] + uniforms.dilation[0] * WRow - uniforms.pad[0];
    let xCol = outCol * uniforms.stride[1] + uniforms.dilation[1] * WCol - uniforms.pad[1];
    let xCh = ${x} % inChannels;
    var resData = ${Ee(s,c)}(0.0);
    // The bounds checking is always needed since we use it to pad zero for
    // the 'same' padding type.
    if (xRow >= 0 && xRow < ${b} && xCol >= 0 && xCol < ${w}) {
      ${g}
      let xIndex = getIndexFromCoords4D(coord, vec4<i32>(uniforms.x_shape));
      ${p(s)}
    }
    return resData;`,T=t?e&&n?`
    let col = colIn * ${s};
    ${$}`:`
    let col = colIn * ${s};
    if (row < uniforms.dim_a_outer && col < uniforms.dim_inner) {
      ${$}
    }
    return ${Ee(s,c)}(0.0);`:n&&r?`
    let col = colIn * ${s};
    ${$}`:`
    let col = colIn * ${s};
    if (row < uniforms.dim_inner && col < uniforms.dim_b_outer) {
      ${$}
    }
    return ${Ee(s,c)}(0.0);`,I=t?n&&r?m(u):`
    let col = colIn * ${u};
    if (row < uniforms.dim_inner && col < uniforms.dim_b_outer) {
      ${m(u)}
    }
    return ${Ee(u,c)}(0.0);`:`
    let col = colIn * ${u};
    if (row < uniforms.dim_inner && col < uniforms.dim_a_outer) {
      ${m(u)}
    }
    return ${Ee(u,c)}(0.0);`,E=Ee(d,c),A=t?Ee(s,c):Ee(u,c),z=t?Ee(u,c):Ee(s,c),v=Ze(i,E,c);return`
    fn mm_readA(batch: i32, row : i32, colIn : i32) -> ${A} {
      ${t?T:I}
    }

    fn mm_readB(batch: i32, row : i32, colIn : i32) -> ${z} {
      ${t?I:T}
    }

    fn mm_write(batch: i32, row : i32, colIn : i32, valueIn : ${E}) {
      let col = colIn * ${d};
      if (row < uniforms.dim_a_outer && col < uniforms.dim_b_outer)
      {
      var value = valueIn;
      let outWidth = ${t?"i32(uniforms.result_shape[2])":"i32(uniforms.result_shape[3])"};
      ${y}
      ${$d(o)}
      ${v}
      setOutputAtCoords(coords[0], coords[1], coords[2], coords[3], value);
      }
    }`},Id=(t,e,r,n,o,i,s,u,d)=>{let c=e.format==="NHWC",p=c?t[0].dims[3]:t[0].dims[1],m=r[0],g=c?r[2]:r[3],y=c?r[1]:r[2],b=c?r[3]:r[1],w=c&&(p%4===0||p%3===0)&&b%4===0,S=c?b:g*y,x=c?g*y:b,$=[8,8,1],T=n<=8?[4,1,1]:[4,4,1],I=[Math.ceil(S/$[0]/T[0]),Math.ceil(x/$[1]/T[1]),Math.ceil(m/$[2]/T[2])];se("verbose",()=>`[conv2d_mm_webgpu] dispatch = ${I}`);let E=w?c&&p%4!==0?3:4:1,A=$[1]*T[1],z=$[0]*T[0],v=Math.max($[0]*E,$[1]),M=n%A===0,N=o%z===0,K=i%v===0,q=w?[E,4,4]:[1,1,1],Q=[{type:6,data:n},{type:6,data:o},{type:6,data:i},{type:6,data:[e.pads[0],e.pads[1]]},{type:6,data:e.strides},{type:6,data:e.dilations}];Qe(e,Q),Q.push(...L(t[0].dims,t[1].dims));let D=["rank","rank"];s&&(Q.push(...L(t[2].dims)),D.push("rank")),Q.push(...L(r));let W=j=>{let Y=[{name:"dim_a_outer",type:"i32"},{name:"dim_b_outer",type:"i32"},{name:"dim_inner",type:"i32"},{name:"pad",type:"i32",length:2},{name:"stride",type:"i32",length:2},{name:"dilation",type:"i32",length:2}];Ye(e,Y);let Z=w?4:1,te=ye(t[0].dataType),ie=`
      fn setOutputAtIndex(flatIndex : i32, value : ${w?`vec4<${te}>`:te}) {
        result[flatIndex] = ${w?`vec4<${te}>`:te}(value);
      }
      fn setOutputAtCoords(d0 : i32, d1 : i32, d2 : i32, d3 : i32, value : ${w?`vec4<${te}>`:te}) {
        let flatIndex = getOutputIndexFromCoords(vec4<i32>(d0, d1, d2, d3));
        setOutputAtIndex(flatIndex ${w?"/ 4":""}, value);
      }`,we=O("x",t[0].dataType,t[0].dims.length,E===3?1:E),Te=O("w",t[1].dataType,t[1].dims.length,Z),re=[we,Te],U=R("result",t[0].dataType,r.length,Z);if(s){let X=O("bias",t[2].dataType,t[2].dims.length,Z);re.push(X),ie+=`
        fn getBiasByOutputCoords(coords : vec4<i32>) -> ${w?`vec4<${te}>`:te} {
          return bias[coords.${c?"w":"y"}${w?"/ 4":""}];
        }`}return`
        ${xd("uniforms.result_strides")}
        //struct Uniforms { xShape : vec4<i32>, wShape : vec4<i32>, outShape : vec4<i32>,
        //  outShapeStrides: vec3<i32>, filterDims : vec2<i32>, pad : vec2<i32>, stride : vec2<i32>,
        //  dilation : vec2<i32>, dimAOuter : i32, dimBOuter : i32, dimInner : i32 };
        ${j.registerUniforms(Y).declareVariables(...re,U)}
        ${ie}
        ${Vh(c,M,N,K,s,e,q[0],q[1],q[2],te)}
        ${w?_o(T,$,te,void 0,!c,v):vo(T,$,te,void 0,!c,v,!1,void 0,u)}`};return{name:"Conv2DMatMul",shaderCache:{hint:`${e.cacheKey};${E};${w};${M};${N};${K};${A};${z};${v}`,inputDependencies:D},getRunData:()=>({outputs:[{dims:d?d(r):r,dataType:t[0].dataType}],dispatchGroup:{x:I[0],y:I[1],z:I[2]},programUniforms:Q}),getShaderSource:W}}});var Lh,Ad,dn,Wh,Ed,Gh,kd,Pd,Od=V(()=>{"use strict";J();nt();ne();ae();St();on();Lh=t=>{let e=1;for(let r=0;r<t.length;r++)e*=t[r];return e},Ad=t=>typeof t=="number"?[t,t,t]:t,dn=(t,e)=>e<=1?t:t+(t-1)*(e-1),Wh=(t,e,r,n=1)=>{let o=dn(e,n);return Math.floor((t[0]*(r-1)-r+o)/2)},Ed=(t,e,r,n,o)=>{o==null&&(o=Wh(t,e[0],n[0]));let i=[0,0,0,r];for(let s=0;s<3;s++)t[s]+2*o>=e[s]&&(i[s]=Math.trunc((t[s]-e[s]+2*o)/n[s]+1));return i},Gh=(t,e,r,n,o,i,s,u,d,c)=>{let p,m,g,y;if(t==="VALID"&&(t=0),typeof t=="number"){p={top:t,bottom:t,left:t,right:t,front:t,back:t};let b=Ed([e,r,n,1],[u,d,c],1,[o,i,s],t);m=b[0],g=b[1],y=b[2]}else if(Array.isArray(t)){if(!t.every((w,S,x)=>w===x[0]))throw Error(`Unsupported padding parameter: ${t}`);p={top:t[0],bottom:t[1],left:t[2],right:t[3],front:t[4],back:t[5]};let b=Ed([e,r,n,1],[u,d,c],1,[o,i,s],t[0]);m=b[0],g=b[1],y=b[2]}else if(t==="SAME_UPPER"){m=Math.ceil(e/o),g=Math.ceil(r/i),y=Math.ceil(n/s);let b=(m-1)*o+u-e,w=(g-1)*i+d-r,S=(y-1)*s+c-n,x=Math.floor(b/2),$=b-x,T=Math.floor(w/2),I=w-T,E=Math.floor(S/2),A=S-E;p={top:T,bottom:I,left:E,right:A,front:x,back:$}}else throw Error(`Unknown padding parameter: ${t}`);return{padInfo:p,outDepth:m,outHeight:g,outWidth:y}},kd=(t,e,r,n,o,i=!1,s="channelsLast")=>{let u,d,c,p,m;if(s==="channelsLast")[u,d,c,p,m]=t;else if(s==="channelsFirst")[u,m,d,c,p]=t;else throw new Error(`Unknown dataFormat ${s}`);let[g,,y,b,w]=e,[S,x,$]=Ad(r),[T,I,E]=Ad(n),A=dn(y,T),z=dn(b,I),v=dn(w,E),{padInfo:M,outDepth:N,outHeight:K,outWidth:q}=Gh(o,d,c,p,S,x,$,A,z,v),Q=i?g*m:g,D=[0,0,0,0,0];return s==="channelsFirst"?D=[u,Q,N,K,q]:s==="channelsLast"&&(D=[u,N,K,q,Q]),{batchSize:u,dataFormat:s,inDepth:d,inHeight:c,inWidth:p,inChannels:m,outDepth:N,outHeight:K,outWidth:q,outChannels:Q,padInfo:M,strideDepth:S,strideHeight:x,strideWidth:$,filterDepth:y,filterHeight:b,filterWidth:w,effectiveFilterDepth:A,effectiveFilterHeight:z,effectiveFilterWidth:v,dilationDepth:T,dilationHeight:I,dilationWidth:E,inShape:t,outShape:D,filterShape:e}},Pd=(t,e,r,n,o,i)=>{let s=i==="channelsLast",u=s?t[0].dims[3]:t[0].dims[1],d=!1,c=[64,1,1],p={x:r.map(($,T)=>T)},m=[Math.ceil(Lh(p.x.map($=>r[$]))/c[0]),1,1];se("verbose",()=>`[conv3d_naive_webgpu] dispatch = ${m}`);let g=d?s&&u%4!==0?3:4:1,y=k.size(r),b=[{type:12,data:y},{type:12,data:n},{type:12,data:o},{type:12,data:e.strides},{type:12,data:e.dilations}];Qe(e,b),b.push(...L(t[0].dims,t[1].dims));let w=["rank","rank"],S=t.length===3;S&&(b.push(...L(t[2].dims)),w.push("rank")),b.push(...L(r));let x=$=>{let T=[{name:"output_size",type:"u32"},{name:"filter_dims",type:"u32",length:n.length},{name:"pads",type:"u32",length:o.length},{name:"strides",type:"u32",length:e.strides.length},{name:"dilations",type:"u32",length:e.dilations.length}];Ye(e,T);let I=d?4:1,E=ye(t[0].dataType),A=O("x",t[0].dataType,t[0].dims.length,g===3?1:g),z=O("W",t[1].dataType,t[1].dims.length,I),v=[A,z],M=R("result",t[0].dataType,r.length,I),N="";if(S){let Q=O("bias",t[2].dataType,t[2].dims.length,I);v.push(Q),N+=`
        fn getBiasByOutputCoords(coords : array<u32, 5>) -> ${d?`vec4<${E}>`:E} {
          return bias[${s?F("coords",4,5):F("coords",1,5)}${d?"/ 4":""}];
        }`}let K=Ee(g,E),q=Ze(e,K,E);return`
            ${N}
            fn getX(d0 : u32, d1 : u32, d2 : u32, d3 : u32, d4 : u32) -> f32 {
              let aIndices = array<u32, 5>(d0, d1, d2, d3, d4);
              return ${A.getByIndices("aIndices")};
            }
            fn getW(d0 : u32, d1 : u32, d2 : u32, d3 : u32, d4 : u32) -> f32 {
              let aIndices = array<u32, 5>(d0, d1, d2, d3, d4);
              return ${z.getByIndices("aIndices")};
            }
          ${$.registerUniforms(T).declareVariables(...v,M)}
          ${$.mainStart()}
          ${$.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
              let coords = ${M.offsetToIndices("global_idx")};
              let batch = ${F("coords",0,A.rank)};
              let d2 = ${s?F("coords",A.rank-1,A.rank):F("coords",1,A.rank)};
              let xFRCCorner = vec3<u32>(${s?F("coords",1,A.rank):F("coords",2,A.rank)},
              ${s?F("coords",2,A.rank):F("coords",3,A.rank)},
              ${s?F("coords",3,A.rank):F("coords",4,A.rank)}) * uniforms.strides - uniforms.pads;
              let xFCorner = xFRCCorner.x;
              let xRCorner = xFRCCorner.y;
              let xCCorner = xFRCCorner.z;
              let xShapeY = ${s?F("uniforms.x_shape",1,A.rank):F("uniforms.x_shape",2,A.rank)};
              let xShapeZ = ${s?F("uniforms.x_shape",2,A.rank):F("uniforms.x_shape",3,A.rank)};
              let xShapeW = ${s?F("uniforms.x_shape",3,A.rank):F("uniforms.x_shape",4,A.rank)};
              let xShapeU = ${s?F("uniforms.x_shape",4,A.rank):F("uniforms.x_shape",1,A.rank)};
              let inputDepthNearestVec4 = (xShapeU / 4) * 4;
              let inputDepthVec4Remainder = xShapeU % 4;

              var value = 0.0;
              for (var wF = 0u; wF < uniforms.filter_dims[0]; wF++) {
                let xF = xFCorner + wF * uniforms.dilations[0];
                if (xF < 0 || xF >= xShapeY) {
                  continue;
                }

                for (var wR = 0u; wR < uniforms.filter_dims[1]; wR++) {
                  let xR = xRCorner + wR * uniforms.dilations[1];
                  if (xR < 0 || xR >= xShapeZ) {
                    continue;
                  }

                  for (var wC = 0u; wC < uniforms.filter_dims[2]; wC++) {
                    let xC = xCCorner + wC * uniforms.dilations[2];
                    if (xC < 0 || xC >= xShapeW) {
                      continue;
                    }

                    for (var d1 = 0u; d1 < inputDepthNearestVec4; d1 += 4) {
                      ${s?`let xValues = vec4<f32>(
                               getX(batch, xF, xR, xC, d1),
                               getX(batch, xF, xR, xC, d1 + 1),
                               getX(batch, xF, xR, xC, d1 + 2),
                               getX(batch, xF, xR, xC, d1 + 3));
                            `:`let xValues = vec4<f32>(
                               getX(batch, d1, xF, xR, xC),
                               getX(batch, d1 + 1, xF, xR, xC),
                               getX(batch, d1 + 2, xF, xR, xC),
                               getX(batch, d1 + 3, xF, xR, xC));
                            `}
                            let wValues = vec4<f32>(
                              getW(d2, d1, wF, wR, wC),
                              getW(d2, d1 + 1, wF, wR, wC),
                              getW(d2, d1 + 2, wF, wR, wC),
                              getW(d2, d1 + 3, wF, wR, wC));
                      value += dot(xValues, wValues);
                    }
                    if (inputDepthVec4Remainder == 1) {
                        ${s?`value += getX(batch, xF, xR, xC, inputDepthNearestVec4)
                          * getW(d2, inputDepthNearestVec4, wF, wR, wC);`:`value += getX(batch, inputDepthNearestVec4, xF, xR, xC)
                          * getW(d2, inputDepthNearestVec4, wF, wR, wC);`}
                    } else if (inputDepthVec4Remainder == 2) {
                      ${s?`let xValues = vec2<f32>(
                        getX(batch, xF, xR, xC, inputDepthNearestVec4),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1));
                      `:`let xValues = vec2<f32>(
                        getX(batch, inputDepthNearestVec4, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 1, xF, xR, xC));
                    `}
                    let wValues = vec2<f32>(
                      getW(d2, inputDepthNearestVec4, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 1, wF, wR, wC));
                      value += dot(xValues, wValues);
                    } else if (inputDepthVec4Remainder == 3) {
                      ${s?`let xValues = vec3<f32>(
                        getX(batch, xF, xR, xC, inputDepthNearestVec4),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 2));
                      `:`let xValues = vec3<f32>(
                        getX(batch, inputDepthNearestVec4, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 1, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 2, xF, xR, xC));
                    `}
                    let wValues = vec3<f32>(
                      getW(d2, inputDepthNearestVec4, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 1, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 2, wF, wR, wC));
                      value += dot(xValues, wValues);
                    }
                  }
                }
              }
              ${S?"value = value + getBiasByOutputCoords(coords)":""};
              ${q}
              result[global_idx] = f32(value);
          }`};return{name:"Conv3DNaive",shaderCache:{hint:`${e.cacheKey};${s};${g};${S}`,inputDependencies:w},getRunData:()=>({outputs:[{dims:r,dataType:t[0].dataType}],dispatchGroup:{x:m[0],y:m[1],z:m[2]},programUniforms:b}),getShaderSource:x}}});var zd,Dd,Bd=V(()=>{"use strict";J();ne();ae();St();zd=(t,e,r,n)=>{let o=t.length>2,i=o?"value += b[output_channel];":"",s=t[0].dims,u=t[1].dims,d=e.format==="NHWC",c=d?r[3]:r[1],p=c/e.group,m=d&&p>=4?fe(c):1,g=k.size(r)/m,y=[{type:12,data:g},{type:12,data:e.dilations},{type:12,data:[e.strides[0],e.strides[1]]},{type:12,data:[e.pads[0],e.pads[1]]},{type:12,data:p}];Qe(e,y),y.push(...L(s,[u[0],u[1],u[2],u[3]/m]));let b=o?["rank","rank","rank"]:["rank","rank"];y.push(...L([r[0],r[1],r[2],r[3]/m]));let w=S=>{let x=R("output",t[0].dataType,r.length,m),$=ye(x.type.tensor),T=Ze(e,x.type.value,$),I=O("x",t[0].dataType,s.length),E=O("w",t[1].dataType,u.length,m),A=[I,E];o&&A.push(O("b",t[2].dataType,t[2].dims,m));let z=[{name:"output_size",type:"u32"},{name:"dilations",type:"u32",length:e.dilations.length},{name:"strides",type:"u32",length:2},{name:"pads",type:"u32",length:2},{name:"output_channels_per_group",type:"u32"}];Ye(e,z);let v=d?`
      for (var wHeight: u32 = 0u; wHeight < uniforms.w_shape[0]; wHeight++) {
        let xHeight = xRCCorner.x + wHeight * uniforms.dilations[0];

        if (xHeight < 0u || xHeight >= uniforms.x_shape[1]) {
          continue;
        }

        for (var wWidth: u32 = 0u; wWidth < uniforms.w_shape[1]; wWidth++) {
          let xWidth = xRCCorner.y + wWidth * uniforms.dilations[1];
          if (xWidth < 0u || xWidth >= uniforms.x_shape[2]) {
            continue;
          }

          for (var wInChannel: u32 = 0u; wInChannel < uniforms.w_shape[2]; wInChannel++) {
            let input_channel = in_channel_offset + wInChannel;
            let xVal = ${I.get("batch","xHeight","xWidth","input_channel")};
            let wVal = ${E.get("wHeight","wWidth","wInChannel","output_channel")};
            value += xVal * wVal;
          }
        }
      }
      `:`
      for (var wInChannel: u32 = 0u; wInChannel < uniforms.w_shape[1]; wInChannel++) {
        let input_channel = in_channel_offset + wInChannel;
        for (var wHeight: u32 = 0u; wHeight < uniforms.w_shape[2]; wHeight++) {
          let xHeight = xRCCorner.x + wHeight * uniforms.dilations[0];

          if (xHeight < 0u || xHeight >= uniforms.x_shape[2]) {
            continue;
          }

          for (var wWidth: u32 = 0u; wWidth < uniforms.w_shape[3]; wWidth++) {
            let xWidth = xRCCorner.y + wWidth * uniforms.dilations[1];
            if (xWidth < 0u || xWidth >= uniforms.x_shape[3]) {
              continue;
            }

            let xVal = ${I.get("batch","input_channel","xHeight","xWidth")};
            let wVal = ${E.get("output_channel","wInChannel","wHeight","wWidth")};
            value += xVal * wVal;
          }
        }
      }
      `;return`
  ${S.registerUniforms(z).declareVariables(...A,x)}

  ${S.mainStart()}
    ${S.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let outputIndices = ${x.offsetToIndices("global_idx")};
    let batch: u32 = outputIndices[0];
    let output_channel: u32 = outputIndices[${d?3:1}];
    let xRCCorner: vec2<u32> = vec2<u32>(outputIndices[${d?1:2}], outputIndices[${d?2:3}]) * uniforms.strides - uniforms.pads;
    let group_id: u32 = output_channel * ${m} / uniforms.output_channels_per_group;
    var in_channel_offset = group_id * uniforms.w_shape[${d?2:1}];

    var value: ${x.type.value} = ${x.type.value}(0);
    ${v}
    ${i}
    ${T}
    ${x.setByOffset("global_idx","value")}
  }`};return{name:"GroupedConv",shaderCache:{hint:`${e.cacheKey}_${m}`,inputDependencies:b},getRunData:()=>({outputs:[{dims:n?n(r):r,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(g/64)},programUniforms:y}),getShaderSource:w}},Dd=(t,e,r,n)=>{let o=t.length>2,i=fe(r[3]),s=fe(r[2]),u=k.size(r)/i/s,d=[t[0].dims[0],t[0].dims[1],t[0].dims[2],t[0].dims[3]/i],c=[t[1].dims[0],t[1].dims[1],t[1].dims[2],t[1].dims[3]/i],p=[r[0],r[1],r[2],r[3]/i],m=[{type:12,data:u},{type:6,data:[e.strides[0],e.strides[1]]},{type:6,data:[e.pads[0],e.pads[1]]}];Qe(e,m),m.push(...L(d,c,p));let g=(s-1)*e.strides[1]+c[1],y=b=>{let w=R("output",t[0].dataType,p.length,i),S=ye(w.type.tensor),x=Ze(e,w.type.value,S),$=O("x",t[0].dataType,d.length,i),T=O("w",t[1].dataType,c.length,i),I=[$,T];o&&I.push(O("b",t[2].dataType,t[2].dims,i));let E=o?"value += b[output_channel];":"",A=[{name:"output_size",type:"u32"},{name:"strides",type:"i32",length:2},{name:"pads",type:"i32",length:2}];return Ye(e,A),`
  ${b.registerUniforms(A).declareVariables(...I,w)}
  ${b.mainStart()}
    ${b.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let width0 = uniforms.output_shape[3];
    let output_channel = global_idx % width0;
    var index1 = global_idx / width0;
    let width1 = uniforms.output_shape[2] / ${s}u;
    let col = (index1 % width1) * ${s}u;
    index1 = index1 / width1;
    let row = index1 % uniforms.output_shape[1];
    let batch = index1 / uniforms.output_shape[1];

    let x_corner = vec2<i32>(i32(row), i32(col)) * uniforms.strides - uniforms.pads;

    var x_vals: array<${$.type.value}, ${g}>;
    var values: array<${w.type.value}, ${s}>;
    let input_channel = output_channel;
    // Use constant instead of uniform can give better performance for w's height/width.
    for (var w_height: u32 = 0u; w_height < ${c[0]}; w_height++) {
      let x_height = x_corner.x + i32(w_height);
      if (x_height >= 0 && u32(x_height) < uniforms.x_shape[1]) {
        for (var i = 0; i < ${g}; i++) {
          let x_width = x_corner.y + i;
          if (x_width >= 0 && u32(x_width) < uniforms.x_shape[2]) {
            x_vals[i] = ${$.get("batch","u32(x_height)","u32(x_width)","input_channel")};
          } else {
            x_vals[i] = ${$.type.value}(0);
          }
        }
        for (var w_width: u32 = 0u; w_width < ${c[1]}; w_width++) {
          let w_val = ${T.get("w_height","w_width","0","output_channel")};
          for (var i = 0u; i < ${s}u; i++) {
            values[i] = fma(x_vals[i * u32(uniforms.strides[1]) + w_width], w_val, values[i]);
          }
        }
      }
    }

    for (var i = 0u; i < ${s}u; i++) {
      var value = values[i];
      ${E}
      ${x}
      ${w.set("batch","row","col + i","output_channel","value")};
    }
  }`};return{name:"GroupedConv-Vectorize",shaderCache:{hint:`${e.cacheKey};${i};${s};${g};${c[0]};${c[1]}`,inputDependencies:o?["rank","rank","type"]:["rank","rank"]},getRunData:()=>({outputs:[{dims:n?n(r):r,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(u/64)},programUniforms:m}),getShaderSource:y}}});var Hh,$o,Fh,xo,So,Md,qh,Kh,To,Rd=V(()=>{"use strict";ne();Cd();Od();un();Bd();St();sn();pt();Hh=(t,e,r,n,o,i)=>{let s=t[0],u=t.slice(i?1:2,i?3:4),d=u.length,c=e[0],m=e.slice(2).map((b,w)=>b+(b-1)*(r[w]-1)),y=u.map((b,w)=>b+n[w]+n[w+d]).map((b,w)=>Math.floor((b-m[w]+o[w])/o[w]));return y.splice(0,0,s),y.splice(i?3:1,0,c),y},$o=[2,3,1,0],Fh=(t,e)=>{if(!t||t.length!==2&&t.length!==3)throw new Error("Conv requires 2 or 3 inputs");if(t[0].dims.length>5)throw new Error("greater than 5D is not supported");if(t[0].dims.length!==t[1].dims.length)throw new Error("filter does not have same dimension as input");let r=t[0].dims[e.format==="NHWC"?t[0].dims.length-1:1],n=t[1].dims[1]*e.group;if(r!==n)throw new Error("FILTER_IN_CHANNEL should be equal to DATA_CHANNEL");if(t.length===3&&(t[2].dims.length!==1||t[1].dims[0]!==t[2].dims[0]))throw new Error("invalid bias");let o=t[0].dims.length-2;if(e.dilations.length!==o)throw new Error(`dilations should be ${o}D`);if(e.strides.length!==o)throw new Error(`strides should be ${o}D`);if(e.pads.length!==o*2)throw new Error(`pads should be ${o*2}D`);if(e.kernelShape.length!==0&&e.kernelShape.length!==t[1].dims.length-2)throw new Error("invalid kernel shape")},xo=(t,e)=>{let r=t.kernelShape.slice();r.length<e[1].dims.length-2&&r.push(...Array(e[1].dims.length-2-r.length).fill(0));for(let i=2;i<e[1].dims.length;++i)r[i-2]===0&&(r[i-2]=e[1].dims[i]);let n=t.pads.slice();zt.adjustPadsBasedOnAutoPad(e[0].dims,t.strides,t.dilations,r,n,t.format==="NHWC",t.autoPad);let o=Object.assign({},t);return Object.assign(o,{kernelShape:r,pads:n}),o},So=t=>{let e=nn(t),r=t.format,n=["NOTSET","VALID","SAME_UPPER","SAME_LOWER"][t.auto_pad],o=t.dilations,i=t.group,s=t.kernel_shape,u=t.pads,d=t.strides,c=t.w_is_const();return{autoPad:n,format:r,dilations:o,group:i,kernelShape:s,pads:u,strides:d,wIsConst:c,...e,cacheKey:`${t.format};${e.activation};`}},Md=(t,e,r,n)=>{let o=r.format==="NHWC",i=Hh(e[0].dims,e[1].dims,r.dilations,r.pads,r.strides,o);if(r.group!==1){let A=[e[0]];if(o){let v=t.kernelCustomData.wT??t.compute(Oe(e[1],$o),{inputs:[1],outputs:[r.wIsConst?-2:-1]})[0];r.wIsConst&&!t.kernelCustomData.wT&&(t.kernelCustomData.wT=v),A.push(v)}else A.push(e[1]);e.length===3&&A.push(e[2]),!t.adapterInfo.isArchitecture("ampere")&&o&&e[1].dims[0]===r.group&&e[1].dims[1]===1&&r.dilations[0]===1&&r.dilations[1]===1?t.compute(Dd(A,r,i,n),{inputs:A}):t.compute(zd(A,r,i,n),{inputs:A});return}let s=e.length===3,u=e[0].dims[o?1:2],d=e[0].dims[o?2:3],c=e[0].dims[o?3:1],p=e[1].dims[2],m=e[1].dims[3],g=i[o?1:2],y=i[o?2:3],b=i[o?3:1],w=o&&p===u&&m===d&&r.pads[0]===0&&r.pads[1]===0;if(w||p===1&&m===1&&r.dilations[0]===1&&r.dilations[1]===1&&r.strides[0]===1&&r.strides[1]===1&&r.pads[0]===0&&r.pads[1]===0){let A=i[0],z,v,M,N=[];if(o){let Q=t.kernelCustomData.wT??t.compute(Oe(e[1],$o),{inputs:[1],outputs:[r.wIsConst?-2:-1]})[0];if(r.wIsConst&&!t.kernelCustomData.wT&&(t.kernelCustomData.wT=Q),w){let D=u*d*c;z=e[0].reshape([1,A,D]),v=Q.reshape([1,D,b]),M=[1,A,b]}else z=e[0].reshape([A,u*d,c]),v=Q.reshape([1,c,b]),M=[A,g*y,b];N.push(z),N.push(v)}else z=e[0].reshape([A,c,u*d]),v=e[1].reshape([1,b,c]),M=[A,b,g*y],N.push(v),N.push(z);s&&N.push(e[2]);let K=M[2],q=N[0].dims[N[0].dims.length-1];K<8&&q<8?t.compute(an(N,r,i,M,o,n),{inputs:N}):t.compute(ir(N,r,i,M,o,n),{inputs:N});return}let S=!0,x=t.kernelCustomData.wT??t.compute(Oe(e[1],$o),{inputs:[1],outputs:[r.wIsConst?-2:-1]})[0];r.wIsConst&&!t.kernelCustomData.wT&&(t.kernelCustomData.wT=x);let $=[e[0],x];s&&$.push(e[2]);let T=o?g*y:b,I=o?b:g*y,E=p*m*c;t.compute(Id($,r,i,T,I,E,s,S,n),{inputs:$})},qh=(t,e)=>{let r=e.format==="NHWC",n=[t.inputs[0].reshape(r?[t.inputs[0].dims[0],1,t.inputs[0].dims[1],t.inputs[0].dims[2]]:[t.inputs[0].dims[0],t.inputs[0].dims[1],1,t.inputs[0].dims[2]]),t.inputs[1].reshape([t.inputs[1].dims[0],t.inputs[1].dims[1],1,t.inputs[1].dims[2]])];t.inputs.length===3&&n.push(t.inputs[2]);let o=[0,e.pads[0],0,e.pads[1]],i=[1].concat(e.strides),s=[1].concat(e.dilations),u=[1].concat(e.kernelShape),d=xo({...e,pads:o,strides:i,dilations:s,kernelShape:u},n);Md(t,n,d,c=>r?[c[0],c[2],c[3]]:[c[0],c[1],c[3]])},Kh=(t,e,r)=>{let n=r.format==="NHWC"?"channelsLast":"channelsFirst",o=xo(r,e),i=r.autoPad==="NOTSET"?r.pads:r.autoPad,s=kd(e[0].dims,e[1].dims,r.strides,r.dilations,i,!1,n);t.compute(Pd(e,o,s.outShape,[s.filterDepth,s.filterHeight,s.filterWidth],[s.padInfo.front,s.padInfo.top,s.padInfo.left],n))},To=(t,e)=>{if(Fh(t.inputs,e),t.inputs[0].dims.length===3)qh(t,e);else if(t.inputs[0].dims.length===5)Kh(t,t.inputs,e);else{let r=xo(e,t.inputs);Md(t,t.inputs,r)}}});var Ud,Nd=V(()=>{"use strict";J();nt();ne();ae();Ud=(t,e,r)=>{let n=t.length>2,o=e.outputShape,i=e.format==="NHWC",s=e.group,u=t[1].dims,d=u[2]/s,c=u[3],p=i?fe(d):1,m=i&&c===1&&d>=4,g=m?Math.floor(d/4)*4:Math.floor(d/p)*p,y=d-g,b=i?fe(c):1,w=i?c===1?p:b:1,S=k.size(o)/b,x=[Math.ceil(S/64),1,1];se("verbose",()=>`[conv2d_backprop_webgpu] dispatch = ${x}`);let $=["rank","rank"],T=[e.strides[0],e.strides[1]],I=[e.kernelShape[i?1:2],e.kernelShape[i?2:3]],E=[e.dilations[0],e.dilations[1]],A=[I[0]+(e.dilations[0]<=1?0:(e.kernelShape[i?1:2]-1)*(e.dilations[0]-1)),I[1]+(e.dilations[1]<=1?0:(e.kernelShape[i?2:3]-1)*(e.dilations[1]-1))],z=[A[0]-1-Math.floor((e.pads[0]+e.pads[2])/2),A[1]-1-Math.floor((e.pads[1]+e.pads[3])/2)],v=[{type:12,data:S},{type:12,data:T},{type:12,data:I},{type:12,data:E},{type:12,data:A},{type:6,data:z},{type:12,data:g},{type:12,data:d},{type:12,data:c},...L(t[0].dims,t[1].dims)];n&&(v.push(...L(t[2].dims)),$.push("rank")),v.push(...L(o));let M=N=>{let K=[{name:"output_size",type:"u32"},{name:"strides",type:"u32",length:T.length},{name:"filter_dims",type:"u32",length:I.length},{name:"dilations",type:"u32",length:I.length},{name:"effective_filter_dims",type:"u32",length:A.length},{name:"pads",type:"i32",length:z.length},{name:"input_channels_per_group_int",type:"u32"},{name:"input_channels_per_group",type:"u32"},{name:"output_channels_per_group",type:"u32"}],q=ye(t[0].dataType),Q=i?1:2,D=i?2:3,W=i?3:1,j=O("W",t[1].dataType,t[1].dims.length,w),Y=O("Dy",t[0].dataType,t[0].dims.length,p),Z=[Y,j];n&&Z.push(O("bias",t[2].dataType,[o[W]].length,b));let te=R("result",t[0].dataType,o.length,b),ie=()=>{let re="";if(m)p===4?re+=`
        let xValue = ${Y.getByOffset("x_offset")};
        let wValue = ${j.getByOffset("w_offset")};
        dotProd = dotProd + dot(xValue, wValue);
        x_offset += 1u;
        w_offset += 1u;`:p===2?re+=`
          dotProd = dotProd + dot(vec4<${q}>(${Y.getByOffset("x_offset")}, ${Y.getByOffset("x_offset + 1u")}), vec4<${q}>(${j.getByOffset("w_offset")}, ${j.getByOffset("w_offset + 1u")}));
          x_offset += 2u;
          w_offset += 2u;`:p===1&&(re+=`
          dotProd = dotProd + dot(vec4<${q}>(${Y.getByOffset("x_offset")}, ${Y.getByOffset("x_offset + 1u")}, ${Y.getByOffset("x_offset + 2u")}, ${Y.getByOffset("x_offset + 3u")}), vec4<${q}>(${j.getByOffset("w_offset")}, ${j.getByOffset("w_offset + 1u")}, ${j.getByOffset("w_offset + 2u")}, ${j.getByOffset("w_offset + 3u")}));
          x_offset += 4u;
          w_offset += 4u;`);else if(re+=`
                  let xValue = ${i?Y.getByOffset(`${Y.indicesToOffset(`${Y.type.indices}(batch, idyR, idyC, inputChannel)`)} / ${p}`):Y.get("batch","inputChannel","idyR","idyC")};
        `,p===1)re+=`
          let w_offset = ${j.indicesToOffset(`${j.type.indices}(u32(wRPerm), u32(wCPerm), inputChannel, wOutChannel)`)};
          let wValue = ${j.getByOffset(`w_offset / ${w}`)};
          dotProd = dotProd + xValue * wValue;`;else for(let U=0;U<p;U++)re+=`
            let wValue${U} = ${j.getByOffset(`${j.indicesToOffset(`${j.type.indices}(u32(wRPerm), u32(wCPerm), inputChannel + ${U}, wOutChannel)`)} / ${w}`)};
            dotProd = dotProd + xValue[${U}] * wValue${U};`;return re},we=()=>{if(y===0)return"";if(!m)throw new Error(`packInputAs4 ${m} is not true.`);let re="";if(p===1){re+="dotProd = dotProd";for(let U=0;U<y;U++)re+=`
            + ${Y.getByOffset(`x_offset + ${U}`)} * ${j.getByOffset(`w_offset + ${U}`)}`;re+=";"}else if(p===2){if(y!==2)throw new Error(`Invalid inputChannelsRemainder ${y}.`);re+=`
          let xValue = ${Y.getByOffset("x_offset")};
          let wValue = ${j.getByOffset("w_offset")};
          dotProd = dotProd + dot(xValue, wValue);`}return re},Te=`
            let outputIndices = ${te.offsetToIndices(`global_idx * ${b}`)};
            let batch = ${te.indicesGet("outputIndices",0)};
            let d1 = ${te.indicesGet("outputIndices",W)};
            let r = ${te.indicesGet("outputIndices",Q)};
            let c = ${te.indicesGet("outputIndices",D)};
            let dyCorner = vec2<i32>(i32(r), i32(c)) - uniforms.pads;
            let dyRCorner = dyCorner.x;
            let dyCCorner = dyCorner.y;
            let groupId = d1 / uniforms.output_channels_per_group;
            let wOutChannel = d1 - groupId * uniforms.output_channels_per_group;
            // Convolve dy(?, ?, d2) with w(:, :, d1, d2) to compute dx(xR, xC, d1).
            // ? = to be determined. : = across all values in that axis.
            var dotProd = ${te.type.value}(0.0);
            var wR: u32 = 0;
            if (uniforms.dilations.x == 1) {
              // Minimum wR >= 0 that satisfies (dyRCorner + wR) % (uniforms.strides.x) == 0
              wR = u32(((dyRCorner + i32(uniforms.strides.x) - 1) / i32(uniforms.strides.x)) * i32(uniforms.strides.x) - dyRCorner);
            }
            for (; wR < uniforms.effective_filter_dims.x; wR = wR + 1) {
              if (wR % uniforms.dilations.x != 0) {
                continue;
              }
              let dyR = (${q}(dyRCorner) + ${q}(wR)) / ${q}(uniforms.strides[0]);
              let wRPerm = uniforms.filter_dims.x - 1 - wR / uniforms.dilations.x;
              if (dyR < 0.0 || dyR >= ${q}(uniforms.Dy_shape[${Q}]) || fract(dyR) > 0.0 ||
                  wRPerm < 0) {
                continue;
              }
              let idyR: u32 = u32(dyR);
              var wC: u32 = 0;
              if (uniforms.dilations.y == 1) {
                // Minimum wC >= 0 that satisfies (dyCCorner + wC) % (uniforms.strides.y) == 0
                wC = u32(((dyCCorner + i32(uniforms.strides.y) - 1) / i32(uniforms.strides.y)) * i32(uniforms.strides.y) - dyCCorner);
              }
              for (; wC < uniforms.effective_filter_dims.y; wC = wC + 1) {
                if (wC % uniforms.dilations.y != 0) {
                  continue;
                }
                let dyC = (${q}(dyCCorner) + ${q}(wC)) / ${q}(uniforms.strides.y);
                let wCPerm = uniforms.filter_dims.y - 1 - wC / uniforms.dilations.y;
                if (dyC < 0.0 || dyC >= ${q}(uniforms.Dy_shape[${D}]) ||
                    fract(dyC) > 0.0 || wCPerm < 0) {
                  continue;
                }
                let idyC: u32 = u32(dyC);
                var inputChannel = groupId * uniforms.input_channels_per_group;
                ${m?`
                var x_offset = ${Y.indicesToOffset(`${Y.type.indices}(batch, idyR, idyC, inputChannel)`)} / ${p};
                var w_offset = ${j.indicesToOffset(`${j.type.indices}(wRPerm, wCPerm, inputChannel, wOutChannel)`)} / ${w};
                  `:""}
                for (var d2: u32 = 0; d2 < uniforms.input_channels_per_group_int; d2 = d2 + ${m?4:p}) {
                  ${ie()}
                  inputChannel = inputChannel + ${m?4:p};
                }
                ${we()}
                wC = wC + uniforms.strides.y - 1;
              }
              wR = wR + uniforms.strides[0] - 1;
            }
            let value = dotProd${n?` + bias[d1 / ${b}]`:""};
            ${te.setByOffset("global_idx","value")};
          `;return`
    ${N.registerUniforms(K).declareVariables(...Z,te)}
      ${N.mainStart()}
      ${N.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")};
    ${Te}}`};return{name:"ConvTranspose2D",shaderCache:{hint:`${e.cacheKey};${p}${w}${b}${m}${y}`,inputDependencies:$},getRunData:()=>({dispatchGroup:{x:x[0],y:x[1],z:x[2]},outputs:[{dims:r?r(o):o,dataType:t[0].dataType}],programUniforms:v}),getShaderSource:M}}});var jh,Zh,Qh,Vd,Ld,Yh,Wd,Xh,Gd,Hd=V(()=>{"use strict";Nd();St();pt();jh=(t,e,r,n,o,i)=>(t-1)*e+r+(n-1)*o+1-i,Zh=(t,e,r,n,o)=>{let i=Math.floor(t/2);e==="SAME_UPPER"?(r[n]=i,r[o]=t-i):e==="SAME_LOWER"&&(r[n]=t-i,r[o]=i)},Qh=(t,e,r,n,o,i,s,u,d,c)=>{let p=t.length-2,m=c.length===0;d.length<p&&d.push(...Array(p-d.length).fill(0));let g=t[0],y=e[u?3:1]*o;for(let b=0,w=t.length-p-(u?1:0);b<p;++b,++w){let S=t[w],x=m?S*s[b]:c[b],$=jh(S,s[b],i[b],e[w],r[b],x);Zh($,n,i,b,b+p),m&&c.push(s[b]*(S-1)+d[b]+(e[w]-1)*r[b]+1-i[b]-i[b+p])}c.splice(0,0,g),c.splice(u?3:1,0,y)},Vd=(t,e)=>{let r=t.kernelShape.slice();if(t.kernelShape.length===0||t.kernelShape.reduce((m,g)=>m*g,1)===0){r.length=0;for(let m=2;m<e[1].dims.length;++m)r.push(e[1].dims[m])}let n=t.format==="NHWC";r.splice(0,0,e[1].dims[0]),r.splice(n?3:1,0,e[1].dims[1]);let o=t.pads.slice(),i=t.outputShape.slice(),s=t.outputPadding.slice(),u=e[0].dims,d=t.dilations.slice();if(d.reduce((m,g)=>m+g,0)===0){let m=e[0].dims.length-2;d=new Array(m).fill(1)}let c=t.strides.slice();if(c.reduce((m,g)=>m+g,0)===0){let m=e[0].dims.length-2;c=new Array(m).fill(1)}Qh(u,r,d,t.autoPad,t.group,o,c,n,s,i);let p=Object.assign({},t);return Object.assign(p,{kernelShape:r,pads:o,outputPadding:s,outputShape:i,dilations:d,strides:c}),p},Ld=t=>{let e=nn(t),r=t.format,n=["NOTSET","VALID","SAME_UPPER","SAME_LOWER"][typeof t.autoPad>"u"?0:t.autoPad],o=t.dilations,i=t.group,s=t.kernelShape,u=t.pads,d=t.strides,c=t.wIsConst(),p=t.outputPadding,m=t.outputShape;return{autoPad:n,format:r,dilations:o,group:i,kernelShape:s,outputPadding:p,outputShape:m,pads:u,strides:d,wIsConst:c,...e,cacheKey:`${t.format};${e.activation};`}},Yh=(t,e)=>{if(!t||t.length!==2&&t.length!==3)throw new Error("Conv requires 2 or 3 inputs");if(t[0].dims.length!==4&&t[0].dims.length!==3)throw new Error("currently only support 2-dimensional conv");if(t[0].dims.length!==t[1].dims.length)throw new Error("filter does not have same dimension as input");let r=t[0].dims[e.format==="NHWC"?t[0].dims.length-1:1],n=t[1].dims[0];if(r!==n)throw new Error("FILTER_IN_CHANNEL should be equal to DATA_CHANNEL");let o=t[1].dims[1]*e.group;if(t.length===3&&(t[2].dims.length!==1||t[2].dims[0]!==o))throw new Error("invalid bias");let i=t[0].dims.length-2;if(e.dilations.reduce((p,m)=>p+m,0)>0&&e.dilations.length!==i)throw new Error(`dilations should be ${i}D`);if(e.strides.reduce((p,m)=>p+m,0)>0&&e.strides.length!==i)throw new Error(`strides should be ${i}D`);if(e.pads.reduce((p,m)=>p+m,0)>0&&e.pads.length!==i*2)throw new Error(`pads should be ${i*2}D`);if(e.outputPadding.length!==i&&e.outputPadding.length!==0)throw new Error(`output_padding should be ${i}D`);if(e.kernelShape.reduce((p,m)=>p+m,0)>0&&e.kernelShape.length!==0&&e.kernelShape.length!==t[1].dims.length-2)throw new Error("invalid kernel shape");if(e.outputShape.length!==0&&e.outputShape.length!==t[0].dims.length-2)throw new Error("invalid output shape")},Wd=(t,e,r,n)=>{let o=t.kernelCustomData.wT??t.compute(Oe(e[1],[2,3,0,1]),{inputs:[1],outputs:[r.wIsConst?-2:-1]})[0];r.wIsConst&&!t.kernelCustomData.wT&&(t.kernelCustomData.wT=o);let i=[e[0],o];e.length===3&&i.push(e[2]),t.compute(Ud(i,r,n),{inputs:i})},Xh=(t,e)=>{let r=e.format==="NHWC",n=[t.inputs[0].reshape(r?[t.inputs[0].dims[0],1,t.inputs[0].dims[1],t.inputs[0].dims[2]]:[t.inputs[0].dims[0],t.inputs[0].dims[1],1,t.inputs[0].dims[2]]),t.inputs[1].reshape([t.inputs[1].dims[0],t.inputs[1].dims[1],1,t.inputs[1].dims[2]])];t.inputs.length===3&&n.push(t.inputs[2]);let o=e.kernelShape;(o.length===0||o[0]===0)&&(o=[t.inputs[1].dims[2]]);let i=e.dilations;(i.length===0||i[0]===0)&&(i=[1]);let s=e.strides;(s.length===0||s[0]===0)&&(s=[1]);let u=e.pads;u.length===0&&(u=[0,0]),u=[0,u[0],0,u[1]],s=[1].concat(s),i=[1].concat(i),o=[1].concat(o);let d=e.outputPadding;d=[0].concat(d);let c=Vd({...e,pads:u,strides:s,dilations:i,kernelShape:o,outputPadding:d},n);Wd(t,n,c,p=>r?[p[0],p[2],p[3]]:[p[0],p[1],p[3]])},Gd=(t,e)=>{if(Yh(t.inputs,e),t.inputs[0].dims.length===3)Xh(t,e);else{let r=Vd(e,t.inputs);Wd(t,t.inputs,r)}}});var Jh,Fd,qd,Kd=V(()=>{"use strict";J();ne();Ie();ae();Jh=(t,e,r,n)=>{let o=k.size(e),i=e.length,s=O("input",t,i),u=R("output",t,i),d=r.dataType===6?r.getInt32Array()[0]:Number(r.getBigInt64Array()[0]),c=k.normalizeAxis(d,i),p=m=>{let g=` i32(${s.indicesGet("inputIndices","uniforms.axis")}) `,y=F("uniforms.input_shape","uniforms.axis",i),b=n.reverse?g+(n.exclusive?" + 1":""):"0",w=n.reverse?y:g+(n.exclusive?"":" + 1");return`
                ${m.registerUniform("outputSize","u32").registerUniform("axis","u32").declareVariables(s,u)}
                ${m.mainStart()}
                  ${m.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
                  var inputIndices = ${u.offsetToIndices("global_idx")};
                  var sum = ${u.type.value}(0);
                  let first : i32 = ${b};
                  let last : i32 = ${w};
                  for (var i : i32 = first; i < last; i++) {
                    ${s.indicesSet("inputIndices","uniforms.axis","u32(i)")};
                    sum = sum + ${s.getByIndices("inputIndices")};
                  }
                  ${u.setByOffset("global_idx","sum")};
                }`};return{name:"CumSum",shaderCache:{hint:n.cacheKey,inputDependencies:["rank"]},getRunData:()=>({outputs:[{dims:e,dataType:t}],dispatchGroup:{x:Math.ceil(o/64)},programUniforms:[{type:12,data:o},{type:12,data:c},...L(e,e)]}),getShaderSource:p}},Fd=(t,e)=>{let r=t.inputs[0].dims,n=t.inputs[0].dataType,o=t.inputs[1];t.compute(Jh(n,r,o,e),{inputs:[0]})},qd=t=>{let e=t.exclusive===1,r=t.reverse===1;return ee({exclusive:e,reverse:r})}});var eg,tg,rg,jd,Zd,Qd=V(()=>{"use strict";J();ne();Ie();ae();eg=t=>{if(!t||t.length!==1)throw new Error("DepthToSpace requires 1 input.");if(t[0].dims.length!==4)throw new Error("DepthToSpace requires 4D input.")},tg=(t,e,r,n)=>{let o=[];o.push(`fn perm(i: ${n.type.indices}) -> ${r.type.indices} {
    var a: ${r.type.indices};`);for(let i=0;i<e;++i)o.push(r.indicesSet("a",t[i],`i[${i}]`));return o.push("return a;}"),o.join(`
`)},rg=(t,e)=>{let r,n,o,i,s,u,d=e.format==="NHWC",c=e.blocksize,p=e.mode==="DCR";d?([r,n,o,i]=t.dims,s=p?[r,n,o,c,c,i/c**2]:[r,n,o,i/c**2,c,c],u=p?[0,1,3,2,4,5]:[0,1,4,2,5,3]):([r,n,o,i]=[t.dims[0],t.dims[2],t.dims[3],t.dims[1]],s=p?[r,c,c,i/c**2,n,o]:[r,i/c**2,c,c,n,o],u=p?[0,3,4,1,5,2]:[0,1,4,2,5,3]);let m=t.reshape(s),g=m.dims.length,y=t.dataType,b=O("a",y,g),w=R("output",y,g),S=x=>`
  ${x.registerUniform("output_size","u32").declareVariables(b,w)}

  ${tg(u,g,b,w)}

  ${x.mainStart()}
    ${x.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let indices = ${w.offsetToIndices("global_idx")};
    let aIndices = perm(indices);

    ${w.setByOffset("global_idx",b.getByIndices("aIndices"))}
  }`;return{name:"DepthToSpace",shaderCache:{hint:`${t.dims};${e.blocksize};${e.mode}`,inputDependencies:["rank"]},getRunData:x=>{let $=d?[r,n*c,o*c,i/c**2]:[r,i/c**2,n*c,o*c],T=k.size($),I=m.dims,E=k.sortBasedOnPerm(I,u);return{outputs:[{dims:$,dataType:x[0].dataType}],dispatchGroup:{x:Math.ceil(T/64)},programUniforms:[{type:12,data:T},...L(I,E)]}},getShaderSource:S}},jd=(t,e)=>{eg(t.inputs),t.compute(rg(t.inputs[0],e))},Zd=t=>ee({blocksize:t.blocksize,mode:t.mode,format:t.format})});var Io,ln,Yd,ng,og,Co,Ao,Xd,ig,Jd,el,tl=V(()=>{"use strict";J();ne();Ie();ae();Io="[a-zA-Z]|\\.\\.\\.",ln="("+Io+")+",Yd="^"+ln+"$",ng="("+ln+",)*"+ln,og="^"+ng+"$",Co=class{constructor(e=-1){this.symbolToIndices=new Map,this.inputIndex=e}addSymbol(e,r){let n=this.symbolToIndices.get(e);n===void 0?n=[r]:n.push(r),this.symbolToIndices.set(e,n)}},Ao=class{constructor(e,r){this.equation=r;this.hasEllipsis=!1,this.symbolToInfo=new Map,this.lhs=new Array,this.outputDims=[];let[n,o]=r.includes("->")?r.split("->",2):[r,""];if(!n.match(RegExp(og)))throw new Error("Invalid LHS term");if(n.split(",").forEach((u,d)=>{let c=e[d].dims.slice();if(!u.match(RegExp(Yd)))throw new Error("Invalid LHS term");let p=this.processTerm(u,!0,c,d);this.lhs.push(p)}),o==="")o+=[...this.symbolToInfo.entries()].filter(([u,d])=>d.count===1||u==="...").map(([u])=>u).join("");else if(!o.match(RegExp(ln)))throw new Error("Invalid RHS");o.match(RegExp(Io,"g"))?.forEach(u=>{if(u==="...")this.outputDims=this.outputDims.concat(this.ellipsisDims);else{let d=this.symbolToInfo.get(u);if(d===void 0)throw new Error("Invalid RHS symbol");this.outputDims.push(d.dimValue)}}),this.rhs=this.processTerm(o,!1,this.outputDims)}addSymbol(e,r,n){let o=this.symbolToInfo.get(e);if(o!==void 0){if(o.dimValue!==r&&o.count!==1)throw new Error("Dimension mismatch");o.count++,o.inputIndices.push(n)}else o={count:1,dimValue:r,inputIndices:[n]};this.symbolToInfo.set(e,o)}processTerm(e,r,n,o=-1){let i=n.length,s=!1,u=[],d=0;if(!e.match(RegExp(Yd))&&!r&&e!=="")throw new Error("Invalid LHS term");let c=e.match(RegExp(Io,"g")),p=new Co(o);return c?.forEach((m,g)=>{if(m==="..."){if(s)throw new Error("Only one ellipsis is allowed per input term");s=!0;let y=i-c.length+1;if(y<0)throw new Error("Ellipsis out of bounds");if(u=n.slice(d,d+y),this.hasEllipsis){if(this.ellipsisDims.length!==u.length||this.ellipsisDims.toString()!==u.toString())throw new Error("Ellipsis dimensions mismatch")}else if(r)this.hasEllipsis=!0,this.ellipsisDims=u;else throw new Error("Ellipsis must be specified in the LHS");for(let b=0;b<u.length;b++){let w=String.fromCharCode(48+b);p.addSymbol(w,g+b),this.addSymbol(w,n[d++],o)}}else p.addSymbol(m,g+(this.hasEllipsis?this.ellipsisDims.length-1:0)),this.addSymbol(m,n[d++],o)}),p}},Xd=t=>t+"_max",ig=(t,e,r,n)=>{let i=t.map(p=>p.length).map((p,m)=>O(`input${m}`,e,p)),s=k.size(n),u=R("output",e,n.length),d=[...r.symbolToInfo.keys()].filter(p=>!r.rhs.symbolToIndices.has(p)),c=p=>{let m=[],g="var prod = 1.0;",y="var sum = 0.0;",b="sum += prod;",w=[],S=[],x=[],$=[],T=r.symbolToInfo.size===r.rhs.symbolToIndices.size;r.symbolToInfo.forEach((E,A)=>{if(r.rhs.symbolToIndices.has(A)){let z=r.rhs.symbolToIndices.get(A)?.[0];z!==void 0&&r.lhs.forEach((v,M)=>{if(E.inputIndices.includes(M)){let N=v.symbolToIndices.get(A);if(N===void 0)throw new Error("Invalid symbol error");N.forEach(K=>{m.push(`${i[M].indicesSet(`input${M}Indices`,K,u.indicesGet("outputIndices",z))}`)})}})}else r.lhs.forEach((z,v)=>{if(E.inputIndices.includes(v)){let M=z.symbolToIndices.get(A);if(M===void 0)throw new Error("Invalid symbol error");M.forEach(N=>{w.push(`${i[v].indicesSet(`input${v}Indices`,N,`${A}`)}`)}),$.push(`prod *= ${i[v].getByIndices(`input${v}Indices`)};`)}}),S.push(`for(var ${A}: u32 = 0; ${A} < uniforms.${Xd(A)}; ${A}++) {`),x.push("}")});let I=T?[...m,`let sum = ${i.map((E,A)=>E.getByIndices(`input${A}Indices`)).join(" * ")};`]:[...m,y,...S,...w,g,...$,b,...x];return`
            ${p.registerUniforms(d.map(E=>({name:`${Xd(E)}`,type:"u32"}))).registerUniform("outputSize","u32").declareVariables(...i,u)}

            ${p.mainStart()}
            ${p.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
            var outputIndices = ${u.offsetToIndices("global_idx")};
            ${i.map((E,A)=>`var input${A}Indices: ${i[A].type.indices};`).join(`
`)}
            ${I.join(`
`)};
            ${u.setByOffset("global_idx","sum")};
          }`};return{name:"Einsum",shaderCache:{hint:r.equation,inputDependencies:t.map(()=>"rank")},getRunData:()=>{let p=d.filter(g=>r.symbolToInfo.has(g)).map(g=>({type:12,data:r.symbolToInfo.get(g)?.dimValue||0}));p.push({type:12,data:s});let m=t.map((g,y)=>[...L(g)]).reduce((g,y)=>g.concat(y),p);return m.push(...L(n)),{outputs:[{dims:n,dataType:e}],dispatchGroup:{x:Math.ceil(s/64)},programUniforms:m}},getShaderSource:c}},Jd=(t,e)=>{let r=new Ao(t.inputs,e.equation),n=r.outputDims,o=t.inputs.map((i,s)=>i.dims);t.compute(ig(o,t.inputs[0].dataType,r,n))},el=t=>{let e=t.equation.replace(/\s+/g,"");return ee({equation:e})}});var ag,rl,sg,ug,nl,ol=V(()=>{"use strict";J();ne();ae();ag=t=>{if(!t||t.length!==2)throw new Error("Expand requires 2 input.");let e=t[0].dims,r=Array.from(t[1].getBigInt64Array(),Number),n=r.length<e.length?0:r.length-e.length,o=e.length<r.length?0:e.length-r.length;for(;n<r.length&&o<e.length;++n,++o)if(r[n]!==e[o]&&r[n]!==1&&e[o]!==1)throw new Error("Expand requires shape to be broadcastable to input")},rl=(t,e)=>{let r=t.length-e.length,n=[];for(let o=0;o<r;++o)n.push(t[o]);for(let o=0;o<e.length;++o)n.push(e[o]===1?t[o+r]:e[o]);return n},sg=(t,e)=>t.length>e.length?rl(t,e):rl(e,t),ug=t=>{let e=t[0].dims,r=Array.from(t[1].getBigInt64Array(),Number),n=sg(e,r),o=t[0].dataType,i=o===9||k.size(e)===1,s=o===9||e.length>0&&e[e.length-1]%4===0?4:1,u=i||n.length>0&&n[n.length-1]%4===0?4:1,d=Math.ceil(k.size(n)/u),c=m=>{let g=O("input",o,e.length,s),y=R("output",o,n.length,u),b;if(o===9){let w=(S,x,$="")=>`
          let outputIndices${x} = ${y.offsetToIndices(`outputOffset + ${x}u`)};
          let offset${x} = ${g.broadcastedIndicesToOffset(`outputIndices${x}`,y)};
          let index${x} = offset${x} / 4u;
          let component${x} = offset${x} % 4u;
          ${S}[${x}] = ${$}(${g.getByOffset(`index${x}`)}[component${x}]);
        `;b=`
        let outputOffset = global_idx * ${u};
        var data = vec4<u32>(0);
        ${w("data",0,"u32")}
        ${w("data",1,"u32")}
        ${w("data",2,"u32")}
        ${w("data",3,"u32")}
        ${y.setByOffset("global_idx","data")}
      }`}else b=`
        let outputIndices = ${y.offsetToIndices(`global_idx * ${u}`)};
        let inputOffset = ${g.broadcastedIndicesToOffset("outputIndices",y)};
        let data = ${y.type.value}(${g.getByOffset(`inputOffset / ${s}`)});
        ${y.setByOffset("global_idx","data")}
      }`;return`
    ${m.registerUniform("vec_size","u32").declareVariables(g,y)}
    ${m.mainStart()}
    ${m.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
    ${b}`},p=[{type:12,data:d},...L(e,n)];return{name:"Expand",shaderCache:{hint:`${n.length};${s}${u}`,inputDependencies:["rank"]},getShaderSource:c,getRunData:()=>({outputs:[{dims:n,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(d/64)},programUniforms:p})}},nl=t=>{ag(t.inputs),t.compute(ug(t.inputs),{inputs:[0]})}});var dg,il,al=V(()=>{"use strict";J();ne();ae();rn();dg=t=>{let e=t[0].dataType,r=k.size(t[0].dims),n=k.size(t[1].dims),o=n%4===0,i=s=>{let u=O("x",e,[1],4),d=O("bias",e,[1],4),c=R("y",e,[1],4),p=[{name:"output_vec_size",type:"u32"},{name:"bias_size",type:"u32"}],m=y=>`
      let bias${y}_offset: u32 = (global_idx * 4 + ${y}) % uniforms.bias_size;
      let bias${y} = ${d.getByOffset(`bias${y}_offset / 4`)}[bias${y}_offset % 4];`,g=o?`
      let bias = ${d.getByOffset("global_idx % (uniforms.bias_size / 4)")};`:`${m(0)}${m(1)}${m(2)}${m(3)}
      let bias = ${u.type.value}(bias0, bias1, bias2, bias3);`;return`${s.registerUniforms(p).declareVariables(u,d,c)}

    ${yo(Pe(e))}

    ${s.mainStart(Dt)}
      ${s.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_vec_size")}

      let x = ${u.getByOffset("global_idx")};
      ${g}
      let x_in = x + bias;
      ${c.setByOffset("global_idx",wo("x_in"))}
    }`};return{name:"FastGeluWithBias",shaderCache:{hint:`${o}`,inputDependencies:["type","type"]},getShaderSource:i,getRunData:s=>({outputs:[{dims:s[0].dims,dataType:s[0].dataType}],programUniforms:[{type:12,data:Math.ceil(r/4)},{type:12,data:n}],dispatchGroup:{x:Math.ceil(r/Dt/4)}})}},il=t=>{t.inputs.length<2||k.size(t.inputs[1].dims)===0?td(t):t.compute(dg(t.inputs))}});var lg,cg,sl,ul,dl=V(()=>{"use strict";J();ne();Ie();ae();lg=t=>{if(!t||t.length!==2)throw new Error("Gather requires 2 inputs.")},cg=(t,e)=>{let r=t[0].dims,n=t[1].dims,o=r.length,i=k.normalizeAxis(e.axis,o),s=r.slice(0);s.splice(i,1,...n);let u=r[i],d=t[0].dataType===9?4:1,c=Math.ceil(k.size(s)/d),p=[{type:12,data:c},{type:6,data:u},{type:12,data:i},...L(t[0].dims,t[1].dims,s)],m=g=>{let y=O("data",t[0].dataType,t[0].dims.length,d),b=O("inputIndices",t[1].dataType,t[1].dims.length),w=R("output",t[0].dataType,s.length,d),S=$=>{let T=n.length,I=`var indicesIndices${$}  = ${b.type.indices}(0);`;for(let E=0;E<T;E++)I+=`${T>1?`indicesIndices${$}[${E}]`:`indicesIndices${$}`} = ${s.length>1?`outputIndices${$}[uniforms.axis + ${E}]`:`outputIndices${$}`};`;I+=`
          var idx${$} = ${b.getByIndices(`indicesIndices${$}`)};
          if (idx${$} < 0) {
            idx${$} = idx${$} + uniforms.axisDimLimit;
          }
          var dataIndices${$} : ${y.type.indices};
        `;for(let E=0,A=0;E<o;E++)E===i?(I+=`${o>1?`dataIndices${$}[${E}]`:`dataIndices${$}`} = u32(idx${$});`,A+=T):(I+=`${o>1?`dataIndices${$}[${E}]`:`dataIndices${$}`} = ${s.length>1?`outputIndices${$}[${A}]`:`outputIndices${$}`};`,A++);return I},x;if(t[0].dataType===9){let $=(T,I,E="")=>`
          let outputIndices${I} = ${w.offsetToIndices(`outputOffset + ${I}u`)};
          ${S(I)};
          let offset${I} = ${y.indicesToOffset(`dataIndices${I}`)};
          let index${I} = offset${I} / 4u;
          let component${I} = offset${I} % 4u;
          ${T}[${I}] = ${E}(${y.getByOffset(`index${I}`)}[component${I}]);
        `;x=`
        let outputOffset = global_idx * ${d};
        var value = vec4<u32>(0);
        ${$("value",0,"u32")}
        ${$("value",1,"u32")}
        ${$("value",2,"u32")}
        ${$("value",3,"u32")}
        ${w.setByOffset("global_idx","value")}
      `}else x=`
      let outputIndices = ${w.offsetToIndices("global_idx")};
      ${S("")};
      let value = ${y.getByIndices("dataIndices")};
      ${w.setByOffset("global_idx","value")};
      `;return`
      ${g.registerUniform("outputSize","u32").registerUniform("axisDimLimit","i32").registerUniform("axis","u32").declareVariables(y,b,w)}
      ${g.mainStart()}
        ${g.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
        ${x}
      }`};return{name:"Gather",shaderCache:{hint:e.cacheKey,inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:s,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(c/64)},programUniforms:p}),getShaderSource:m}},sl=t=>ee({axis:t.axis}),ul=(t,e)=>{let r=t.inputs;lg(r),t.compute(cg(t.inputs,e))}});var pg,ll,cl,pl=V(()=>{"use strict";J();ne();ae();pg=(t,e,r,n,o,i,s,u,d)=>{let c=[{type:12,data:i},{type:12,data:n},{type:12,data:o},{type:12,data:r},{type:12,data:s},{type:12,data:u},{type:12,data:d}],p=[i];c.push(...L(e.dims,p));let m=g=>{let y=O("indices_data",e.dataType,e.dims.length),b=R("input_slice_offsets_data",12,1,1),w=[y,b],S=[{name:"output_size",type:"u32"},{name:"batch_dims",type:"u32"},{name:"input_dims",type:"u32",length:o.length},{name:"sizes_from_slice_dims_data",type:"u32",length:r.length},{name:"num_slices_per_batch",type:"u32"},{name:"input_batch_stride",type:"u32"},{name:"num_slice_dims",type:"u32"}];return`
  ${g.registerUniforms(S).declareVariables(...w)}
  ${g.mainStart()}
    ${g.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let batch_idx = global_idx / uniforms.num_slices_per_batch;
    let base_offset = batch_idx * uniforms.input_batch_stride;

    let slice_indices_base_offset = global_idx * uniforms.num_slice_dims;
    var relative_slice_offset = 0;
    for (var dim_idx = 0u; dim_idx < uniforms.num_slice_dims; dim_idx ++) {
      var index = i32(indices_data[dim_idx + slice_indices_base_offset].x);
      let input_dim_idx = uniforms.batch_dims + dim_idx;
      if (index < 0) {
        ${o.length===1?"index += i32(uniforms.input_dims);":"index += i32(uniforms.input_dims[input_dim_idx]);"}
      }
      ${r.length===1?"relative_slice_offset += index * i32(uniforms.sizes_from_slice_dims_data);":"relative_slice_offset += index * i32(uniforms.sizes_from_slice_dims_data[dim_idx]);"}
    }

    input_slice_offsets_data[global_idx] =  base_offset + u32(relative_slice_offset);
  }`};return t.compute({name:"computeSliceOffsets",shaderCache:{hint:`${o.length}_${r.length}`,inputDependencies:["rank"]},getRunData:()=>({outputs:[{dims:p,dataType:t.inputs[1].dataType}],dispatchGroup:{x:Math.ceil(i/64)},programUniforms:c}),getShaderSource:m},{inputs:[e],outputs:[-1]})[0]},ll=(t,e)=>{let r=t.inputs,n=r[0].dims,o=r[0].dataType,i=r[1].dims,s=i[i.length-1],u=k.sizeToDimension(i,i.length-1),d=k.sizeFromDimension(n,e.batchDims+s),c=k.sizeToDimension(n,e.batchDims),p=k.sizeFromDimension(n,e.batchDims),m=u/c,g=new Array(s),y=d;for(let I=0;I<s;++I)g[s-1-I]=y,y*=n[e.batchDims+s-1-I];let b=pg(t,r[1],g,e.batchDims,n,u,m,p,s),w=e.batchDims+s;if(w>n.length)throw new Error("last dimension of indices must not be larger than rank of input tensor");let S=i.slice(0,-1).concat(n.slice(w)),x=k.size(S),$=[{type:12,data:x},{type:12,data:d},...L(r[0].dims,b.dims,S)],T=I=>{let E=O("data",r[0].dataType,r[0].dims.length),A=O("slice_offsets",12,b.dims.length),z=R("output",r[0].dataType,S.length);return`
          ${I.registerUniform("output_size","u32").registerUniform("slice_size","u32").declareVariables(E,A,z)}
            ${I.mainStart()}
            ${I.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
          let slice_offset = slice_offsets[global_idx / uniforms.slice_size];
          output[global_idx] = data[u32(slice_offset) + global_idx % uniforms.slice_size];
        }`};t.compute({name:"GatherND",shaderCache:{hint:e.cacheKey,inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:S,dataType:o}],dispatchGroup:{x:Math.ceil(x/64)},programUniforms:$}),getShaderSource:T},{inputs:[r[0],b]})},cl=t=>({batchDims:t.batch_dims,cacheKey:""})});var mg,fg,ml,fl,hl=V(()=>{"use strict";J();ne();Ie();ae();mg=(t,e)=>{if(t.length<3||t.length>4)throw new Error("GatherBlockQuantized requires 3 or 4 inputs.");let r=k.normalizeAxis(e.quantizeAxis,t[0].dims.length),n=e.blockSize,o=t[0],i=t[2],s=t.length===4?t[3]:void 0;if(i.dims.length!==o.dims.length||!o.dims.map((u,d)=>d===r?Math.ceil(u/n)===i.dims[d]:u===i.dims[d]).reduce((u,d)=>u&&d,!0))throw new Error("Scales must have the same rank as the input tensor and the dims should match except on gatherAxis.");if(s){if(s.dataType!==o.dataType)throw new Error("Zero point must have the same data type as the input tensor.");if(s.dims.length!==i.dims.length||!s.dims.map((u,d)=>u===i.dims[d]).reduce((u,d)=>u&&d,!0))throw new Error("Zero point must have the same rank as the input tensor and the dims should match except on quantizeAxis.")}},fg=(t,e)=>{let r=t[0].dims,n=t[1].dims,o=r.length,i=k.normalizeAxis(e.gatherAxis,o),s=k.normalizeAxis(e.quantizeAxis,o),u=r.slice(0);u.splice(i,1,...n);let d=k.size(u),c=t[2].dataType,m=t[0].dataType===22,g=[{type:12,data:d},{type:12,data:s},{type:12,data:i},{type:12,data:e.blockSize},...L(...t.map((b,w)=>b.dims),u)],y=b=>{let w=O("data",t[0].dataType,t[0].dims.length),S=O("inputIndices",t[1].dataType,t[1].dims.length),x=O("scales",t[2].dataType,t[2].dims.length),$=t.length>3?O("zeroPoint",t[3].dataType,t[3].dims.length):void 0,T=R("output",c,u.length),I=[w,S,x];$&&I.push($);let E=[{name:"output_size",type:"u32"},{name:"quantize_axis",type:"u32"},{name:"gather_axis",type:"u32"},{name:"block_size",type:"u32"}];return`
        ${b.registerUniforms(E).declareVariables(...I,T)}
        ${b.mainStart()}
        let output_indices = ${T.offsetToIndices("global_idx")};
        var indices_indices = ${S.type.indices}(0);
        ${n.length>1?`
          for (var i: u32 = 0; i < ${n.length}; i++) {
            let index = ${T.indicesGet("output_indices","uniforms.gather_axis + i")};
            ${S.indicesSet("indices_indices","i","index")};
          }`:`indices_indices = ${T.indicesGet("output_indices","uniforms.gather_axis")};`};
        var data_indices = ${w.type.indices}(0);
        for (var i: u32 = 0; i < uniforms.gather_axis; i++) {
          let index = ${T.indicesGet("output_indices","i")};
          ${w.indicesSet("data_indices","i","index")};
        }
        var index_from_indices = ${S.getByIndices("indices_indices")};
        if (index_from_indices < 0) {
          index_from_indices += ${r[i]};
        }
        ${w.indicesSet("data_indices","uniforms.gather_axis","u32(index_from_indices)")};
        for (var i = uniforms.gather_axis + 1; i < ${u.length}; i++) {
          let index = ${T.indicesGet("output_indices",`i + ${n.length} - 1`)};
          ${w.indicesSet("data_indices","i","index")};
        }
        let data_offset = ${w.indicesToOffset("data_indices")};
        let data_index = data_offset % 8;
        // Convert 4-bit packed data to 8-bit packed data.
        let packed_4bit_quantized_data = ${w.getByOffset("data_offset / 8")};
        let packed_8bit_quantized_data = (packed_4bit_quantized_data >> (4 * (data_index % 2))) & 0x0f0f0f0f;
        let quantized_data_vec = ${m?"unpack4xI8":"unpack4xU8"}(u32(packed_8bit_quantized_data));
        let quantized_data = quantized_data_vec[data_index / 2];
        var scale_indices = data_indices;
        let quantize_axis_index = ${x.indicesGet("data_indices","uniforms.quantize_axis")} / uniforms.block_size;
        ${x.indicesSet("scale_indices","uniforms.quantize_axis","quantize_axis_index")};
        var scale = ${x.getByIndices("scale_indices")};
        ${$?`
              let zero_point_indices = scale_indices;
              let zero_point_offset = ${$.indicesToOffset("zero_point_indices")};
              let zero_point_index = zero_point_offset % 8;
              let packed_4bit_zero_points = ${$.getByOffset("zero_point_offset / 8")};
              let packed_8bit_zero_points = (packed_4bit_zero_points >> (4 * (zero_point_index % 2))) & 0x0f0f0f0f;
              let zero_point_vec = ${m?"unpack4xI8":"unpack4xU8"}(u32(packed_8bit_zero_points));
              let zero_point = zero_point_vec[zero_point_index / 2];`:"var zero_point = 0"};
        let dequantized_data = ${Pe(c)}(quantized_data - zero_point) * scale;
        ${T.setByOffset("global_idx","dequantized_data")};
    }`};return{name:"GatherBlockQuantized",shaderCache:{hint:`${e.cacheKey};${t.filter((b,w)=>w!==1).map(b=>b.dims.join("_")).join(";")}`,inputDependencies:Array.from({length:t.length},(b,w)=>"rank")},getRunData:()=>({outputs:[{dims:u,dataType:c}],dispatchGroup:{x:Math.ceil(d/64)},programUniforms:g}),getShaderSource:y}},ml=(t,e)=>{let r=t.inputs;mg(r,e),t.compute(fg(t.inputs,e))},fl=t=>ee({blockSize:t.blockSize,gatherAxis:t.gatherAxis,quantizeAxis:t.quantizeAxis})});var hg,gg,gl,bl,yl=V(()=>{"use strict";J();ne();Ie();ae();hg=t=>{if(!t||t.length!==2)throw new Error("GatherElements requires 2 inputs.");if(t[0].dims.length<1)throw new Error("GatherElements requires that the data input be rank >= 1.");if(t[0].dims.length!==t[1].dims.length)throw new Error(`GatherElements requires that the data input and
                     indices input tensors be of same rank.`)},gg=(t,e)=>{let r=t[0].dims,n=t[0].dataType,o=r.length,i=t[1].dims,s=t[1].dataType,u=k.normalizeAxis(e.axis,o),d=r[u],c=i.slice(0),p=k.size(c),m=O("input",n,o),g=O("indicesInput",s,i.length),y=R("output",n,c.length),b=[{type:12,data:p},{type:6,data:d},{type:12,data:u}];return b.push(...L(r,i,c)),{name:"GatherElements",shaderCache:{inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:c,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(p/64)},programUniforms:b}),getShaderSource:x=>`
      ${x.registerUniform("outputSize","u32").registerUniform("axisDimLimit","i32").registerUniform("axis","u32").declareVariables(m,g,y)}
      ${x.mainStart()}
      ${x.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

      let outputIndices = ${y.offsetToIndices("global_idx")};

      var idx = ${g.getByOffset("global_idx")};
      if (idx < 0) {
        idx = idx + uniforms.axisDimLimit;
      }
      var inputIndices = ${m.type.indices}(outputIndices);
      ${m.indicesSet("inputIndices","uniforms.axis","u32(idx)")};
      let value = ${m.getByIndices("inputIndices")};

      ${y.setByOffset("global_idx","value")};
  }`}},gl=t=>ee({axis:t.axis}),bl=(t,e)=>{let r=t.inputs;hg(r),t.compute(gg(t.inputs,e))}});var bg,yg,wl,_l,vl=V(()=>{"use strict";J();ne();ae();bg=t=>{if(!t)throw new Error("Input is missing");if(t.length<2||t.length>3)throw new Error("Invaid input number.");if(t.length===3&&t[2].dims.length>2)throw new Error("Invalid input shape of C");if(t[0].dataType!==t[1].dataType||t.length===3&&t[0].dataType!==t[2].dataType)throw new Error("Input types are mismatched")},yg=(t,e)=>{let r=t[0].dims.slice(),n=t[1].dims.slice(),[o,i,s]=Gr.getShapeOfGemmResult(r,e.transA,n,e.transB,t.length===3?t[2].dims:void 0),u=[o,i];if(!u)throw new Error("Can't use gemm on the given tensors");let d=16,c=Math.ceil(i/d),p=Math.ceil(o/d),m=!0,g=k.size(u),y=[{type:12,data:m?c:g},{type:12,data:o},{type:12,data:i},{type:12,data:s},{type:1,data:e.alpha},{type:1,data:e.beta}],b=["type","type"];t.length===3&&(y.push(...L(t[2].dims)),b.push("rank")),y.push(...L(u));let w=x=>{let $="";e.transA&&e.transB?$="value += a[k * uniforms.M + m] * b[n * uniforms.K + k];":e.transA&&!e.transB?$="value += a[k * uniforms.M + m] * b[k * uniforms.N + n];":!e.transA&&e.transB?$="value += a[m * uniforms.K + k] * b[n * uniforms.K + k];":!e.transA&&!e.transB&&($="value += a[m * uniforms.K + k] * b[k * uniforms.N + n];");let T=e.alpha===1?"":"value *= uniforms.alpha;",I=O("a",t[0].dataType,t[0].dims),E=O("b",t[1].dataType,t[1].dims),A=I.type.value,z=null,v=[I,E];t.length===3&&(z=O("c",t[2].dataType,t[2].dims.length),v.push(z));let M=R("output",t[0].dataType,u.length);v.push(M);let N=[{name:"output_size",type:"u32"},{name:"M",type:"u32"},{name:"N",type:"u32"},{name:"K",type:"u32"},{name:"alpha",type:"f32"},{name:"beta",type:"f32"}];return`
  ${x.registerUniforms(N).declareVariables(...v)}

  ${x.mainStart()}
    ${x.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let m = global_idx / uniforms.N;
    let n = global_idx % uniforms.N;

    var value = ${A}(0);
    for (var k: u32 = 0u; k < uniforms.K; k++) {
      ${$}
    }

    ${T}
    ${z!=null?`let cOffset = ${z.broadcastedIndicesToOffset("vec2(m, n)",M)}; value += ${A}(uniforms.beta) * ${z.getByOffset("cOffset")};`:""}
    output[global_idx] = value;
  }`},S=x=>{let $=O("a",t[0].dataType,t[0].dims),T=O("b",t[1].dataType,t[1].dims),I=null,E=[$,T];t.length===3&&(I=O("c",t[2].dataType,t[2].dims.length),E.push(I));let A=R("output",t[0].dataType,u.length);E.push(A);let z=[{name:"num_tile_n",type:"u32"},{name:"M",type:"u32"},{name:"N",type:"u32"},{name:"K",type:"u32"},{name:"alpha",type:"f32"},{name:"beta",type:"f32"}],v="",M="";e.transA&&e.transB?(M=`
      var col = tile_row_start + local_id.x;
      var row = k_start + local_id.y;
      if (col < uniforms.M && row < uniforms.K) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.M + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${$.type.value}(0);
      }

      col = k_start + local_id.x;
      row = tile_col_start + local_id.y;
      if (col < uniforms.K && row < uniforms.N) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.K + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${T.type.value}(0);
      }
      `,v="value += tile_a[k][local_id.y] * tile_b[local_id.x][k];"):e.transA&&!e.transB?(M=`
      var col = tile_row_start + local_id.x;
      var row = k_start + local_id.y;
      if (col < uniforms.M && row < uniforms.K) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.M + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${$.type.value}(0);
      }

      col = tile_col_start + local_id.x;
      row = k_start + local_id.y;
      if (col < uniforms.N && row < uniforms.K) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.N + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${T.type.value}(0);
      }
      `,v="value += tile_a[k][local_id.y] * tile_b[k][local_id.x];"):!e.transA&&e.transB?(M=`
      var col = k_start + local_id.x;
      var row = tile_row_start + local_id.y;
      if (col < uniforms.K && row < uniforms.M) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.K + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${$.type.value}(0);
      }

      col = k_start + local_id.x;
      row = tile_col_start + local_id.y;
      if (col < uniforms.K && row < uniforms.N) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.K + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${T.type.value}(0);
      }
      `,v="value += tile_a[local_id.y][k] * tile_b[local_id.x][k];"):!e.transA&&!e.transB&&(M=`
      var col = k_start + local_id.x;
      var row = tile_row_start + local_id.y;
      if (col < uniforms.K && row < uniforms.M) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.K + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${$.type.value}(0);
      }

      col = tile_col_start + local_id.x;
      row = k_start + local_id.y;
      if (col < uniforms.N && row < uniforms.K) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.N + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${T.type.value}(0);
      }
      `,v="value += tile_a[local_id.y][k] * tile_b[k][local_id.x];");let N=e.alpha===1?"":"value *= uniforms.alpha;";return`
  ${x.registerUniforms(z).declareVariables(...E)}
  var<workgroup> tile_a: array<array<${$.type.storage}, ${d}>, ${d}>;
  var<workgroup> tile_b: array<array<${T.type.storage}, ${d}>, ${d}>;
  ${x.mainStart([d,d,1])}
    let tile_col_start = (workgroup_index % uniforms.num_tile_n) * ${d};
    let tile_row_start = (workgroup_index / uniforms.num_tile_n) * ${d};
    let num_tiles = (uniforms.K - 1) / ${d} + 1;
    var k_start = 0u;
    var value = ${A.type.value}(0);
    for (var t: u32 = 0u; t < num_tiles; t++) {
      ${M}
      k_start = k_start + ${d};
      workgroupBarrier();

      for (var k: u32 = 0u; k < ${d}; k++) {
        ${v}
      }
      workgroupBarrier();
    }

    ${N}
    let m = tile_row_start + local_id.y;
    let n = tile_col_start + local_id.x;
    ${I!=null?`let cOffset = ${I.broadcastedIndicesToOffset("vec2(m, n)",A)}; value += ${A.type.value}(uniforms.beta) * ${I.getByOffset("cOffset")};`:""}
    if (m < uniforms.M && n < uniforms.N) {
      output[m * uniforms.N + n] = value;
    }
  }`};return m?{name:"GemmShared",shaderCache:{hint:`${e.cacheKey}`,inputDependencies:b},getRunData:()=>({outputs:[{dims:u,dataType:t[0].dataType}],dispatchGroup:{x:c*p},programUniforms:y}),getShaderSource:S}:{name:"Gemm",shaderCache:{hint:`${e.cacheKey}`,inputDependencies:b},getRunData:()=>({outputs:[{dims:u,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(g/64)},programUniforms:y}),getShaderSource:w}},wl=t=>{let e=t.transA,r=t.transB,n=t.alpha,o=t.beta;return{transA:e,transB:r,alpha:n,beta:o,cacheKey:`${t.transA};${t.transB};${t.alpha===1}`}},_l=(t,e)=>{bg(t.inputs),t.compute(yg(t.inputs,e))}});var mt,Tt,Gt,Ht,wg,_g,vg,$g,xg,Sg,Tg,Ig,$l,xl,Sl=V(()=>{"use strict";J();ne();Ie();ae();[mt,Tt,Gt,Ht]=[0,1,2,3],wg=t=>{if(t[0].dims.length!==4)throw new Error("only 4-D tensor is supported.");if(t[0].dims.length!==t[1].dims.length)throw new Error("input dimensions must be equal to grid dimensions");if(t[0].dims.length-2!==t[1].dims[t[1].dims.length-1])throw new Error(`last dimension of grid must be equal to ${t[0].dims.length-2}`);if(t[0].dims[0]!==t[1].dims[0])throw new Error("grid batch size must match input batch size")},_g=`
  fn gs_get_cubic_coeffs(x: f32) -> vec4<f32> {
    let cubic_alpha = -0.75f;
    let x_abs = abs(x);
    var coeffs: vec4<f32>;
    coeffs[0] = (((cubic_alpha * (x_abs + 1) - 5 * cubic_alpha) * (x_abs + 1) + 8 * cubic_alpha) * (x_abs + 1) - 4 * cubic_alpha);
    coeffs[1] = (((cubic_alpha + 2) * x_abs - (cubic_alpha + 3)) * x_abs * x_abs + 1);
    coeffs[2] = (((cubic_alpha + 2) * (1 - x_abs) - (cubic_alpha + 3)) * (1 - x_abs) * (1 - x_abs) + 1);
    coeffs[3] = (((cubic_alpha * (2 - x_abs) - 5 * cubic_alpha) * (2 - x_abs) + 8 * cubic_alpha) * (2 - x_abs) - 4 * cubic_alpha);
    return coeffs;
  }
`,vg=t=>`
  fn gs_bicubic_interpolate(p: mat4x4<${t}>, x: f32, y: f32) -> ${t} {
    var v: vec4<f32>;
    var coeffs = gs_get_cubic_coeffs(x);
    for (var i = 0; i < 4; i++) {
      v[i] = coeffs[0] * p[i][0] + coeffs[1] * p[i][1] + coeffs[2] * p[i][2] + coeffs[3] * p[i][3];
    }
    coeffs = gs_get_cubic_coeffs(y);
    let pixel = ${t}(coeffs[0] * v[0] + coeffs[1] * v[1] + coeffs[2] * v[2] + coeffs[3] * v[3]);
    return pixel;
  }
`,$g=t=>`
  fn gs_denormalize(n: f32, length: i32) -> f32 {
    ${t.alignCorners===0?`
    // alignCorners: false => [-1, 1] to [-0.5, length - 0.5]
    return ((n + 1.0) * f32(length) - 1.0) / 2.0;
    `:`
    // alignCorners: true => [-1, 1] to [0, length - 1]
    return (n + 1.0) / 2.0 * (f32(length - 1));
    `}
  }
`,xg=t=>`
  ${t.paddingMode==="reflection"?`
      fn gs_reflect(x: i32, x_min: f32, x_max: f32) -> u32 {
        var dx = 0.0;
        var fx = f32(x);
        let range = x_max - x_min;
        if (fx < x_min) {
          dx = x_min - fx;
          let n = u32(dx / range);
          let r = dx - f32(n) * range;
          if (n % 2 == 0) {
            fx = x_min + r;
          } else {
            fx = x_max - r;
          }
        } else if (fx > x_max) {
          dx = fx - x_max;
          let n = u32(dx / range);
          let r = dx - f32(n) * range;
          if (n % 2 == 0) {
            fx = x_max - r;
          } else {
            fx = x_min + r;
          }
        }
        return u32(fx);
      }`:""}
`,Sg=(t,e,r)=>`
  fn pixel_at_grid(r: i32, c: i32, H: i32, W: i32, batch: u32, channel: u32, border: vec4<f32>) -> ${e} {
     var pixel = ${e}(0);
     var indices = vec4<u32>(0);
     indices[${mt}] = batch;
     indices[${Tt}] = channel;`+(()=>{switch(r.paddingMode){case"zeros":return`
          if (r >= 0 && r < H && c >=0 && c < W) {
            indices[${Gt}] = u32(r);
            indices[${Ht}] = u32(c);
          } else {
            return ${e}(0);
          }
        `;case"border":return`
          indices[${Gt}] = u32(clamp(r, 0, H - 1));
          indices[${Ht}] = u32(clamp(c, 0, W - 1));
        `;case"reflection":return`
          indices[${Gt}] = gs_reflect(r, border[1], border[3]);
          indices[${Ht}] = gs_reflect(c, border[0], border[2]);
        `;default:throw new Error(`padding mode ${r.paddingMode} is not supported`)}})()+`
    return ${t.getByIndices("indices")};
  }
`,Tg=(t,e,r)=>(()=>{switch(r.mode){case"nearest":return`
          let result = pixel_at_grid(i32(round(y)), i32(round(x)), H_in, W_in, indices[${mt}], indices[${Tt}], border);
        `;case"bilinear":return`
          let x1 = i32(floor(x));
          let y1 = i32(floor(y));
          let x2 = x1 + 1;
          let y2 = y1 + 1;

          let p11 = pixel_at_grid(y1, x1, H_in, W_in, indices[${mt}], indices[${Tt}], border);
          let p12 = pixel_at_grid(y1, x2, H_in, W_in, indices[${mt}], indices[${Tt}], border);
          let p21 = pixel_at_grid(y2, x1, H_in, W_in, indices[${mt}], indices[${Tt}], border);
          let p22 = pixel_at_grid(y2, x2, H_in, W_in, indices[${mt}], indices[${Tt}], border);

          let dx2 = ${e}(f32(x2) - x);
          let dx1 = ${e}(x - f32(x1));
          let dy2 = ${e}(f32(y2) - y);
          let dy1 = ${e}(y - f32(y1));
          let result = dy2 * (dx2 * p11 + dx1 * p12) + dy1 * (dx2 * p21 + dx1 * p22);
        `;case"bicubic":return`
          let x0 = i32(floor(x)) - 1;
          let y0 = i32(floor(y)) - 1;
          var p: mat4x4<${e}>;
          for (var h = 0; h < 4; h++) {
            for (var w = 0; w < 4; w++) {
              p[h][w] = pixel_at_grid(h + y0, w + x0, H_in, W_in, indices[${mt}], indices[${Tt}], border);
            }
          }

          let dx = x - f32(x0 + 1);
          let dy = y - f32(y0 + 1);
          let result = gs_bicubic_interpolate(p, dx, dy);
        `;default:throw new Error(`mode ${r.mode} is not supported`)}})()+`${t.setByOffset("global_idx","result")}`,Ig=(t,e)=>{let r=O("x",t[0].dataType,t[0].dims.length),n=[t[1].dims[0],t[1].dims[1],t[1].dims[2]],o=O("grid",t[1].dataType,n.length,2),i=[t[0].dims[0],t[0].dims[1],t[1].dims[1],t[1].dims[2]];e.format==="NHWC"&&(i=[t[0].dims[0],t[1].dims[1],t[1].dims[2],t[0].dims[3]],[mt,Tt,Gt,Ht]=[0,3,1,2]);let s=R("output",t[0].dataType,i.length),u=r.type.value,d=k.size(i),c=[{type:12,data:d},...L(t[0].dims,n,i)],p=m=>`
  ${m.registerUniform("output_size","u32").declareVariables(r,o,s)}
  ${_g}
  ${vg(u)}
  ${$g(e)}
  ${xg(e)}
  ${Sg(r,u,e)}

  ${m.mainStart()}
    ${m.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
      let H_in = i32(uniforms.x_shape[${Gt}]);
      let W_in = i32(uniforms.x_shape[${Ht}]);

      ${e.alignCorners===0?`
      let x_min = -0.5;
      let x_max = f32(W_in) - 0.5;
      let y_min = -0.5;
      let y_max = f32(H_in) - 0.5;
      `:`
      let x_min = 0.0;
      let x_max = f32(W_in) - 1.0;
      let y_min = 0.0;
      let y_max = f32(H_in) - 1.0;
      `};
      let border = vec4<f32>(x_min, y_min, x_max, y_max);

      let indices = ${s.offsetToIndices("global_idx")};
      var grid_indices = vec3<u32>(indices[${mt}], indices[${Gt}], indices[${Ht}]);
      let nxy = ${o.getByIndices("grid_indices")};
      var x = gs_denormalize(f32(nxy[0]), W_in);
      var y = gs_denormalize(f32(nxy[1]), H_in);

      ${Tg(s,u,e)}
  }`;return{name:"GridSample",shaderCache:{hint:`${e.cacheKey}`,inputDependencies:["type","type"]},getRunData:m=>{let g=k.size(i);return{outputs:[{dims:i,dataType:m[0].dataType}],dispatchGroup:{x:Math.ceil(g/64)},programUniforms:c}},getShaderSource:p}},$l=(t,e)=>{wg(t.inputs),t.compute(Ig(t.inputs,e))},xl=t=>ee({alignCorners:t.align_corners,mode:t.mode,paddingMode:t.padding_mode,format:t.format})});var Re,Eg,Il,Tl,kg,ar,Cl,Eo=V(()=>{"use strict";J();ne();Ie();Zr();en();ae();pt();Re=(t,e)=>t.length>e&&t[e].dims.length>0?t[e]:void 0,Eg=(t,e)=>{let r=t[0],n=Re(t,1),o=Re(t,2),i=Re(t,3),s=Re(t,4),u=Re(t,5),d=Re(t,6),c=Re(t,7);if(r.dims.length!==3&&r.dims.length!==5)throw new Error("Input query is expected to have 3 or 5 dimensions");let p=r.dims[0],m=r.dims[1],g=r.dims.length===3?r.dims[2]:e.numHeads*r.dims[4],y=m,b=0,w=0,S=Math.floor(g/e.numHeads);if(d&&c&&k.size(d.dims)&&k.size(c.dims)){if(d.dims.length!==4)throw new Error('Input "past_key" is expected to have 4 dimensions');if(d.dims[0]!==p||d.dims[1]!==e.numHeads||d.dims[3]!==S)throw new Error('Input "past_key" shape (batch_size, num_heads, past_sequence_length, head_size)');if(c.dims[0]!==p||c.dims[1]!==e.numHeads||c.dims[3]!==S)throw new Error('Input "past_value" shape (batch_size, num_heads, past_sequence_length, head_size)');if(d.dims[2]!==c.dims[2])throw new Error('Input "past_key" and "past_value" shall have same dim 2 (past_sequence_length)');if(c.dims.length!==4)throw new Error('Input "past_value" is expected to have 4 dimensions');b=d.dims[2],w=d.dims[2]}else if(d&&k.size(d.dims)||c&&k.size(c.dims))throw new Error('Input "past_key" and "past_value" shall be both present or both absent');let x;if(n&&k.size(n.dims)>0){if(r.dims.length!==3)throw new Error('Input "query" is expected to have 3 dimensions when key is given');if(n.dims.length<3||n.dims.length>5)throw new Error('Input "key" is expected to have 3, 4, or 5 dimensions');if(r.dims[0]!==n.dims[0])throw new Error('Input "query" and "key" shall have same dim 0 (batch size)');if(n.dims.length===3){if(n.dims[2]!==r.dims[2])throw new Error('Input "query" and "key" shall have same dim 2 (hidden_size)');x=2,y=n.dims[1]}else if(n.dims.length===5){if(n.dims[2]!==e.numHeads||n.dims[3]!==2||n.dims[4]!==S)throw new Error('Expect "key" shape (batch_size, kv_sequence_length, num_heads, 2, head_size) for packed kv');if(o)throw new Error('Expect "value" be none when "key" has packed kv format.');x=5,y=n.dims[1]}else{if(n.dims[1]!==e.numHeads||n.dims[3]!==S)throw new Error('Expect "key" shape (batch_size, num_heads, kv_sequence_length, head_size) for past_key');x=0,y=n.dims[2]}}else{if(r.dims.length!==5)throw new Error('Input "query" is expected to have 5 dimensions when key is empty');if(r.dims[2]!==e.numHeads||r.dims[3]!==3)throw new Error('Expect "query" shape (batch_size, kv_sequence_length, num_heads, 3, head_size) for packed kv');x=3}if(i&&k.size(i.dims)>0){if(i.dims.length!==1)throw new Error('Input "bias" is expected to have 1 dimension');if(n&&n.dims.length===5&&n.dims[3]===2)throw new Error("bias is not allowed for packed kv.")}let $=b+y,T=0;if(s&&k.size(s.dims)>0){T=8;let z=s.dims;throw z.length===1?z[0]===p?T=1:z[0]===3*p+2&&(T=3):z.length===2&&z[0]===p&&z[1]===$&&(T=5),T===8?new Error('Input "key_padding_mask" shape shall be (batch_size) or (batch_size, total_sequence_length)'):new Error("Mask not supported")}let I=!1,E=g;if(o&&k.size(o.dims)>0){if(o.dims.length!==3&&o.dims.length!==4)throw new Error('Input "value" is expected to have 3 or 4 dimensions');if(r.dims[0]!==o.dims[0])throw new Error('Input "query" and "value" shall have same dim 0 (batch_size)');if(o.dims.length===3){if(y!==o.dims[1])throw new Error('Input "key" and "value" shall have the same dim 1 (kv_sequence_length)');E=o.dims[2]}else{if(y!==o.dims[2])throw new Error('Input "key" and "value" shall have the same dim 2 (kv_sequence_length)');E=o.dims[1]*o.dims[3],I=!0}}let A=!1;if(s&&k.size(s.dims)>0)throw new Error("Key padding mask is not supported");if(u&&k.size(u.dims)>0){if(u.dims.length!==4)throw new Error('Input "attention_bias" is expected to have 4 dimensions');if(u.dims[0]!==p||u.dims[1]!==e.numHeads||u.dims[2]!==m||u.dims[3]!==$)throw new Error('Expect "attention_bias" shape (batch_size, num_heads, sequence_length, total_sequence_length)')}return{batchSize:p,sequenceLength:m,pastSequenceLength:b,kvSequenceLength:y,totalSequenceLength:$,maxSequenceLength:w,inputHiddenSize:0,hiddenSize:g,vHiddenSize:E,headSize:S,vHeadSize:Math.floor(E/e.numHeads),numHeads:e.numHeads,isUnidirectional:!1,pastPresentShareBuffer:!1,maskFilterValue:e.maskFilterValue,maskType:T,scale:e.scale,broadcastResPosBias:A,passPastInKv:I,qkvFormat:x}},Il=t=>ee({...t}),Tl=ee({perm:[0,2,1,3]}),kg=(t,e,r,n,o,i,s)=>{let u=[n,o,i],d=k.size(u),c=[{type:12,data:d},{type:12,data:s},{type:12,data:i}],p=m=>{let g=R("qkv_with_bias",e.dataType,u),y=O("qkv",e.dataType,u),b=O("bias",r.dataType,u),w=[{name:"output_size",type:"u32"},{name:"bias_offset",type:"u32"},{name:"hidden_size",type:"u32"}];return`
  ${m.registerUniforms(w).declareVariables(y,b,g)}
  ${m.mainStart()}
    ${m.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let bias_offset_idx = (global_idx % uniforms.hidden_size) + uniforms.bias_offset;

    qkv_with_bias[global_idx] = qkv[global_idx] + bias[bias_offset_idx];
  }`};return t.compute({name:"MultiHeadAttentionAddBias",shaderCache:{inputDependencies:["type","type"]},getRunData:()=>({outputs:[{dims:u,dataType:e.dataType,gpuDataType:0}],dispatchGroup:{x:Math.ceil(d/64)},programUniforms:c}),getShaderSource:p},{inputs:[e,r],outputs:[-1]})[0]},ar=(t,e,r,n,o,i,s,u)=>{let d=i;if(s&&k.size(s.dims)>0){if(n===1)throw new Error("AddBiasReshape is not implemented. Please export your model with packed QKV or KV");return d=kg(t,i,s,e,n,r*o,u),d=d.reshape([e,n,r,o]),r===1||n===1?d:t.compute(Oe(d,Tl.perm),{inputs:[d],outputs:[-1]})[0]}else return i.dims.length===3&&(d=i.reshape([e,n,r,o])),r===1||n===1?d:t.compute(Oe(d,Tl.perm),{inputs:[d],outputs:[-1]})[0]},Cl=(t,e)=>{let r=Eg(t.inputs,e),n=t.inputs[0],o=Re(t.inputs,1),i=Re(t.inputs,2),s=Re(t.inputs,3),u=Re(t.inputs,4),d=Re(t.inputs,5),c=Re(t.inputs,6),p=Re(t.inputs,7);if(n.dims.length===5)throw new Error("Packed QKV is not implemented");if(o?.dims.length===5)throw new Error("Packed KV is not implemented");let m=o&&i&&o.dims.length===4&&i.dims.length===4,g=ar(t,r.batchSize,r.numHeads,r.sequenceLength,r.headSize,n,s,0);if(m)return Wt(t,g,o,i,u,void 0,c,p,d,r);if(!o||!i)throw new Error("key and value must be provided");let y=ar(t,r.batchSize,r.numHeads,r.kvSequenceLength,r.headSize,o,s,r.hiddenSize),b=ar(t,r.batchSize,r.numHeads,r.kvSequenceLength,r.vHeadSize,i,s,2*r.hiddenSize);Wt(t,g,y,b,u,void 0,c,p,d,r)}});var Pg,Og,zg,Dg,ko,Al,El,Po=V(()=>{"use strict";J();ne();Ie();ae();Pg=t=>{if(!t||t.length<1)throw new Error("too few inputs")},Og=(t,e)=>{let r=[],n=e.numOutputs;return t[1].dims[0]>0&&(t[1].getBigInt64Array().forEach(o=>r.push(Number(o))),n=r.length),ee({numOutputs:n,axis:e.axis,splitSizes:r})},zg=t=>`
fn calculateOutputIndex(index: u32) -> u32 {
    for (var i: u32 = 0u; i < ${t}u; i += 1u ) {
    if (index < ${F("uniforms.size_in_split_axis","i",t)}) {
        return i;
    }
    }
    return ${t}u;
}`,Dg=t=>{let e=t.length,r=[];for(let n=0;n<e;++n){let o=t[n].setByIndices("indices","input[global_idx]");e===1?r.push(o):n===0?r.push(`if (output_number == ${n}u) { ${o} }`):n===e-1?r.push(`else { ${o} }`):r.push(`else if (output_number == ${n}) { ${o} }`)}return`
      fn writeBufferData(output_number: u32, indices: ${t[0].type.indices}, global_idx: u32) {
        ${r.join(`
`)}
      }`},ko=(t,e)=>{let r=t[0].dims,n=k.size(r),o=t[0].dataType,i=k.normalizeAxis(e.axis,r.length),s=new Array(e.numOutputs),u=O("input",o,r.length),d=new Array(e.numOutputs),c=[],p=[],m=0,g=[{type:12,data:n}];for(let b=0;b<e.numOutputs;b++){m+=e.splitSizes[b],d[b]=m;let w=r.slice();w[i]=e.splitSizes[b],p.push(w),s[b]=R(`output${b}`,o,w.length),c.push({dims:p[b],dataType:t[0].dataType})}g.push({type:12,data:d},...L(r,...p));let y=b=>`
  ${b.registerUniform("input_size","u32").registerUniform("size_in_split_axis","u32",d.length).declareVariables(u,...s)}
  ${zg(d.length)}
  ${Dg(s)}

  ${b.mainStart()}
    ${b.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.input_size")}

    var indices = ${u.offsetToIndices("global_idx")};
    var index = ${u.indicesGet("indices",i)};
    let output_number = calculateOutputIndex(index);
    if (output_number != 0) {
      index -= ${F("uniforms.size_in_split_axis","output_number - 1u",d.length)};
      ${u.indicesSet("indices",i,"index")};
    }
    writeBufferData(output_number, indices, global_idx);
  }`;return{name:"Split",shaderCache:{hint:e.cacheKey,inputDependencies:["rank"]},getShaderSource:y,getRunData:()=>({outputs:c,dispatchGroup:{x:Math.ceil(n/64)},programUniforms:g})}},Al=(t,e)=>{Pg(t.inputs);let r=t.inputs.length===1?e:Og(t.inputs,e);t.compute(ko(t.inputs,r),{inputs:[0]})},El=t=>{let e=t.axis,r=t.splitSizes,n=t.numOutputs<0?r.length:t.numOutputs;if(n!==r.length)throw new Error("numOutputs and splitSizes length must be equal");return ee({axis:e,numOutputs:n,splitSizes:r})}});var Bg,cn,kl,Oo=V(()=>{"use strict";J();ne();Ie();ae();Bg=(t,e)=>{let[r,n,o,i]=t,{numHeads:s,rotaryEmbeddingDim:u}=e;if(r.dims.length!==3&&r.dims.length!==4)throw new Error(`Input 'x' is expected to have 3 or 4 dimensions, got ${r.dims.length}`);if(!k.areEqual(n.dims,[])&&!k.areEqual(n.dims,[1])&&n.dims.length!==2)throw new Error(`Input 'position_ids' is expected to have 0, 1, or 2 dimensions, got ${n.dims.length}`);if(o.dims.length!==2)throw new Error(`Input 'cos_cache' is expected to have 2 dimensions, got ${o.dims.length}`);if(i.dims.length!==2)throw new Error(`Input 'sin_cache' is expected to have 2 dimensions, got ${i.dims.length}`);if(!k.areEqual(o.dims,i.dims))throw new Error("Inputs 'cos_cache' and 'sin_cache' are expected to have the same shape");if(u>0&&s===0)throw new Error("num_heads must be provided if rotary_embedding_dim is specified");let d=r.dims[0],c=r.dims[r.dims.length-2],p=o.dims[0],m=k.sizeFromDimension(r.dims,1)/c,g=u===0?o.dims[1]*2:m/s;if(u>g)throw new Error("rotary_embedding_dim must be less than or equal to head_size");if(n.dims.length===2){if(d!==n.dims[0])throw new Error(`Input 'position_ids' dimension 0 should be of size batch_size, got ${n.dims[0]}`);if(c!==n.dims[1])throw new Error(`Input 'position_ids' dimension 1 should be of size sequence_length, got ${n.dims[1]}`)}if(g/2!==o.dims[1]&&u/2!==o.dims[1])throw new Error(`Input 'cos_cache' dimension 1 should be same as head_size / 2 or rotary_embedding_dim / 2, got ${o.dims[1]}`);if(c>p)throw new Error("Updating cos_cache and sin_cache in RotaryEmbedding is not currently supported")},cn=(t,e)=>{let{interleaved:r,numHeads:n,rotaryEmbeddingDim:o,scale:i}=e,s=t[0].dims[0],u=k.sizeFromDimension(t[0].dims,1),d=t[0].dims[t[0].dims.length-2],c=u/d,p=t[2].dims[1],m=o===0?p*2:c/n,g=new Array(s,d,c/m,m-p),y=k.computeStrides(g),b=[{type:1,data:i},{type:12,data:g},{type:12,data:y},...t[0].dims.length===3?new Array({type:12,data:[u,c,m,1]}):[],...t[0].dims.length===4?new Array({type:12,data:[u,m,d*m,1]}):[],...L(t[0].dims,t[1].dims,t[2].dims,t[3].dims,t[0].dims)],w=S=>{let x=O("input",t[0].dataType,t[0].dims.length),$=O("position_ids",t[1].dataType,t[1].dims.length),T=O("cos_cache",t[2].dataType,t[2].dims.length),I=O("sin_cache",t[3].dataType,t[3].dims.length),E=R("output",t[0].dataType,t[0].dims.length);return S.registerUniforms([{name:"scale",type:"f32"},{name:"global_shape",type:"u32",length:g.length},{name:"global_strides",type:"u32",length:y.length},{name:"input_output_strides",type:"u32",length:y.length}]),`
        ${S.declareVariables(x,$,T,I,E)}

        ${S.mainStart(Dt)}
          let half_rotary_emb_dim = uniforms.${T.name}_shape[1];
          let bsnh = global_idx / uniforms.global_strides % uniforms.global_shape;
          let size = uniforms.global_shape[0] * uniforms.global_strides[0];
          ${S.guardAgainstOutOfBoundsWorkgroupSizes("size")}

          if (bsnh[3] < half_rotary_emb_dim) {
            let position_ids_idx =
                ${$.broadcastedIndicesToOffset("bsnh.xy",R("",$.type.tensor,2))};
            let position_id =
                u32(${$.getByOffset("position_ids_idx")}) + select(0, bsnh[1], position_ids_idx == 0);
            let i = dot(bsnh, uniforms.input_output_strides) + select(0, bsnh[3], ${r});
            let j = i + select(half_rotary_emb_dim, 1, ${r});
            let re = ${x.getByOffset("i")} * ${T.get("position_id","bsnh[3]")} -
                ${x.getByOffset("j")} * ${I.get("position_id","bsnh[3]")};
            ${E.setByOffset("i","re")}
            let im = ${x.getByOffset("i")} * ${I.get("position_id","bsnh[3]")} +
                ${x.getByOffset("j")} * ${T.get("position_id","bsnh[3]")};
            ${E.setByOffset("j","im")}
          } else {
            let k = dot(bsnh, uniforms.input_output_strides) + half_rotary_emb_dim;
            ${E.setByOffset("k",x.getByOffset("k"))}
          }
        }`};return{name:"RotaryEmbedding",shaderCache:{hint:ee({interleaved:r}).cacheKey,inputDependencies:["rank","rank","rank","rank"]},getShaderSource:w,getRunData:()=>({outputs:[{dims:t[0].dims,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(k.size(g)/Dt)},programUniforms:b})}},kl=(t,e)=>{Bg(t.inputs,e),t.compute(cn(t.inputs,e))}});var Mg,Rg,Pl,Ug,Ol,zl=V(()=>{"use strict";Ie();J();en();Eo();Po();pt();Oo();ae();Mg=(t,e)=>{if(e.doRotary&&t.length<=7)throw new Error("cos_cache and sin_cache inputs are required if do_rotary is specified");let r=t[0],n=t[1],o=t[2],i=t[3],s=t[4];if(e.doRotary!==0&&t.length<=7)throw new Error("cos_cast and sin_cache are expected if do_rotary attribute is non-zero");if(e.localWindowSize!==-1)throw new Error("Local attention is not supported");if(e.softcap!==0)throw new Error("Softcap is not supported");if(e.rotaryInterleaved!==0)throw new Error("Rotary interleaved is not supported");if(e.smoothSoftmax)throw new Error("Smooth softmax is not supported");if(r.dims.length!==3&&r.dims.length!==5)throw new Error("Input query is expected to have 3 or 5 dimensions");let u=!1,d=r.dims[0],c=r.dims[1],p=r.dims.length===3?u?r.dims[2]/3:r.dims[2]:e.numHeads*r.dims[4],m=c,g=0,y=!n||n.dims.length===0,b=Math.floor(y?p/(e.numHeads+2*e.kvNumHeads):p/e.numHeads);y&&(p=b*e.numHeads);let w=i&&i.dims.length!==0,S=s&&s.dims.length!==0;if(w&&i.dims.length===4&&i.dims[0]===d&&i.dims[1]!==e.kvNumHeads&&i.dims[2]===e.kvNumHeads&&i.dims[3]===b)throw new Error("BSNH pastKey/pastValue is not supported");if(w&&S){if(i.dims.length!==4)throw new Error('Input "past_key" is expected to have 4 dimensions');if(s.dims.length!==4)throw new Error('Input "past_value" is expected to have 4 dimensions');g=i.dims[2]}else if(w||S)throw new Error('Input "past_key" and "past_value" shall be both present or both absent');let $=1;if(n&&n.dims.length>0){if(r.dims.length!==3)throw new Error('Input "query" is expected to have 3 dimensions when key is given');if(n.dims.length<3||n.dims.length>5)throw new Error('Input "key" is expected to have 3, 4, or 5 dimensions');if(r.dims[0]!==n.dims[0])throw new Error('Input "query" and "key" shall have same dim 0 (batch size)');if(n.dims.length===3){if(r.dims[2]%n.dims[2]!==0)throw new Error('Dimension 2 of "query" should be a multiple of "key"');m=n.dims[1]}else if(n.dims.length===5){if(n.dims[2]!==e.numHeads||n.dims[3]!==2||n.dims[4]!==b)throw new Error('Expect "key" shape (batch_size, kv_sequence_length, num_heads, 2, head_size) for packed kv');if(o)throw new Error('Expect "value" be none when "key" has packed kv format.');m=n.dims[1]}else{if(n.dims[1]!==e.numHeads||n.dims[3]!==b)throw new Error('Expect "key" shape (batch_size, num_heads, kv_sequence_length, head_size) for past_key');m=n.dims[2]}}else{if(r.dims.length!==3&&r.dims.length!==5)throw new Error('Input "query" is expected to have 3 or 5 dimensions when key is empty');if(r.dims.length===5&&(r.dims[2]!==e.numHeads||r.dims[3]!==3))throw new Error('Expect "query" shape (batch_size, kv_sequence_length, num_heads, 3, head_size) for packed kv');$=3}let T=0,I=!1,E=e.kvNumHeads?b*e.kvNumHeads:p;if(o&&o.dims.length>0){if(o.dims.length!==3&&o.dims.length!==4)throw new Error('Input "value" is expected to have 3 or 4 dimensions');if(r.dims[0]!==o.dims[0])throw new Error('Input "query" and "value" shall have same dim 0 (batch_size)');if(o.dims.length===3){if(m!==o.dims[1])throw new Error('Input "key" and "value" shall have the same dim 1 (kv_sequence_length)');E=o.dims[2]}else{if(m!==o.dims[2])throw new Error('Input "past_key" and "past_value" shall have the same dim 2 (kv_sequence_length)');E=o.dims[1]*o.dims[3],I=!0}}let A=t.length>4?t[5]:void 0;if(A&&A.dims.length!==1&&A.dims[0]!==d)throw new Error('Input "seqlens" is expected to have 1 dimension and the same dim 0 as batch_size');return{batchSize:d,sequenceLength:c,pastSequenceLength:g,kvSequenceLength:m,totalSequenceLength:-1,maxSequenceLength:-1,inputHiddenSize:0,hiddenSize:p,vHiddenSize:E,headSize:b,vHeadSize:Math.floor(E/e.kvNumHeads),numHeads:e.numHeads,kvNumHeads:e.kvNumHeads,nReps:e.numHeads/e.kvNumHeads,pastPresentShareBuffer:!1,maskType:T,scale:e.scale,broadcastResPosBias:!1,passPastInKv:I,qkvFormat:$}},Rg=ee({perm:[0,2,1,3]}),Pl=(t,e,r)=>{let n=e,o=r.kvNumHeads;return e.dims.length===3&&r.kvSequenceLength!==0&&(n=e.reshape([r.batchSize,r.kvSequenceLength,o,r.headSize]),n=t.compute(Oe(n,Rg.perm),{inputs:[n],outputs:[-1]})[0]),n},Ug=(t,e,r,n)=>{let o=7,i=["type","type"],s=[t*e],u=t*e,d=[{type:12,data:u},{type:12,data:e},{type:12,data:t}],c=p=>{let m=O("seq_lens",r.dataType,r.dims),g=O("total_seq_lens",n.dataType,n.dims),y=R("pos_ids",o,s),b=[{name:"output_size",type:"u32"},{name:"sequence_length",type:"u32"},{name:"batch_size",type:"u32"}];return`
  ${p.registerUniforms(b).declareVariables(m,g,y)}
  ${p.mainStart()}
    ${p.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let total_sequence_length = u32(${g.getByOffset("0")});
    let is_subsequent_prompt = uniforms.sequence_length > 1 && uniforms.sequence_length != total_sequence_length;
    let is_first_prompt = !is_subsequent_prompt && uniforms.sequence_length == total_sequence_length;
    let batch_idx = global_idx / uniforms.sequence_length;
    let sequence_idx = i32(global_idx % uniforms.sequence_length);
    var pos_id: i32 = 0;
    let seqlen = ${m.getByOffset("batch_idx")};
    let total_seqlen = seqlen + 1;
    if (is_first_prompt) {
      if (sequence_idx < total_seqlen) {
        pos_id = sequence_idx;
      } else {
        pos_id = 1;
      }
      ${y.setByOffset("global_idx","pos_id")}
    } else if (is_subsequent_prompt) {
      let past_seqlen = total_seqlen - i32(uniforms.sequence_length);
      if (past_seqlen + sequence_idx < total_seqlen) {
        pos_id = past_seqlen + sequence_idx;
      } else {
        pos_id = 1;
      }
      ${y.setByOffset("global_idx","pos_id")}
    } else if (global_idx < uniforms.batch_size) {
      ${y.setByOffset("global_idx","seqlen")}
    };
  }
  `};return{name:"GeneratePositionIds",shaderCache:{hint:`${t};${e}`,inputDependencies:i},getRunData:()=>({outputs:[{dims:s,dataType:o}],dispatchGroup:{x:Math.ceil(u/64)},programUniforms:d}),getShaderSource:c}},Ol=(t,e)=>{let r=Mg(t.inputs,e);if(t.inputs[0].dims.length===5)throw new Error("Packed QKV is not implemented");if(t.inputs[1]?.dims.length===5)throw new Error("Packed KV is not implemented");let n=t.inputs[0],o=t.inputs[1]&&t.inputs[1].dims.length>0?t.inputs[1]:void 0,i=t.inputs[2]&&t.inputs[2].dims.length>0?t.inputs[2]:void 0,s=t.inputs[3]&&t.inputs[3].dims.length!==0?t.inputs[3]:void 0,u=t.inputs[4]&&t.inputs[4].dims.length!==0?t.inputs[4]:void 0,d=t.inputs.length>4?t.inputs[5]:void 0,c=t.inputs.length>5?t.inputs[6]:void 0,p=r.kvNumHeads?r.kvNumHeads:r.numHeads,m=ee({axis:2,numOutputs:3,splitSizes:[r.numHeads*r.headSize,p*r.headSize,p*r.headSize]}),[g,y,b]=!o&&!i?t.compute(ko([n],m),{inputs:[n],outputs:[-1,-1,-1]}):[n,o,i],w,S;if(e.doRotary){let I=t.compute(Ug(r.batchSize,r.sequenceLength,d,c),{inputs:[d,c],outputs:[-1]})[0],E=t.inputs[7],A=t.inputs[8],z=ee({interleaved:e.rotaryInterleaved!==0,numHeads:r.numHeads,rotaryEmbeddingDim:0,scale:e.scale}),v=[g,I,E,A],M=[-1];w=t.compute(cn(v,z),{inputs:v,outputs:M})[0],v.splice(0,1,y);let N=ee({interleaved:e.rotaryInterleaved!==0,numHeads:r.kvNumHeads,rotaryEmbeddingDim:0,scale:e.scale});S=t.compute(cn(v,N),{inputs:v,outputs:M})[0]}let x=ar(t,r.batchSize,r.numHeads,r.sequenceLength,r.headSize,e.doRotary?w:g,void 0,0),$=Pl(t,e.doRotary?S:y,r),T=Pl(t,b,r);Wt(t,x,$,T,void 0,void 0,s,u,void 0,r,d,c)}});var Dl,Ng,Vg,Bl,Ml=V(()=>{"use strict";J();ne();pt();ae();Dl=(t,e,r,n,o,i,s,u)=>{let d=fe(i),c=d===1?"f32":`vec${d}f`,p=d===1?"vec2f":`mat2x${d}f`,m=o*s,g=64;m===1&&(g=256);let y=[o,s,i/d],b=[o,s,2],w=["rank","type","type"],S=[];S.push(...L(y,b));let x=$=>{let T=O("x",e.dataType,3,d),I=O("scale",r.dataType,r.dims),E=O("bias",n.dataType,n.dims),A=R("output",1,3,2),z=[T,I,E,A];return`
  var<workgroup> workgroup_shared : array<${p}, ${g}>;
  const workgroup_size = ${g}u;
  ${$.declareVariables(...z)}
  ${$.mainStart(g)}
    let batch = workgroup_index / uniforms.x_shape[1];
    let channel = workgroup_index % uniforms.x_shape[1];
    let hight = uniforms.x_shape[2];
    // initialize workgroup memory
    var sum = ${c}(0);
    var squared_sum = ${c}(0);
    for (var h = local_idx; h < hight; h += workgroup_size) {
      let value = ${c}(${T.get("batch","channel","h")});
      sum += value;
      squared_sum += value * value;
    }
    workgroup_shared[local_idx] = ${p}(sum, squared_sum);
    workgroupBarrier();

    for (var currSize = workgroup_size >> 1;  currSize > 0; currSize = currSize >> 1) {
      if (local_idx < currSize) {
        workgroup_shared[local_idx] = workgroup_shared[local_idx] + workgroup_shared[local_idx + currSize];
      }
      workgroupBarrier();
    }
    if (local_idx == 0) {
      let sum_final = ${je("workgroup_shared[0][0]",d)} / f32(hight * ${d});
      let squared_sum_final = ${je("workgroup_shared[0][1]",d)} / f32(hight * ${d});

      let inv_std_dev = inverseSqrt(squared_sum_final - sum_final * sum_final + f32(${u}));
      let channel_scale = inv_std_dev * f32(scale[channel]);
      let channel_shift = f32(bias[channel]) - sum_final * channel_scale;
      output[workgroup_index] = vec2f(channel_scale, channel_shift);
    }
  }`};return t.compute({name:"InstanceNormComputeChannelScaleShift",shaderCache:{hint:`${d};${u};${g}`,inputDependencies:w},getRunData:()=>({outputs:[{dims:b,dataType:1}],dispatchGroup:{x:m},programUniforms:S}),getShaderSource:x},{inputs:[e,r,n],outputs:[-1]})[0]},Ng=(t,e,r)=>{let n=e[0].dims,o=n,i=2,s=n[0],u=n[1],d=k.sizeFromDimension(n,i),c=fe(d),p=k.size(o)/c,m=Dl(t,e[0],e[1],e[2],s,d,u,r.epsilon),g=[s,u,d/c],y=[s,u],b=["type","none"],w=S=>{let x=O("x",e[0].dataType,g.length,c),$=O("scale_shift",1,y.length,2),T=R("output",e[0].dataType,g.length,c),I=[x,$,T];return`
  ${S.registerUniform("output_size","u32").declareVariables(...I)}
  ${S.mainStart()}
  ${S.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
      let outputIndices = ${T.offsetToIndices("global_idx")};
      let batch = outputIndices[0];
      let channel = outputIndices[1];
      let scale_shift = ${$.getByIndices("vec2<u32>(batch, channel)")};
      let value = ${x.getByOffset("global_idx")} * ${T.type.value}(scale_shift.x) + ${T.type.value}(scale_shift.y);
      ${T.setByOffset("global_idx","value")};
  }`};t.compute({name:"InstanceNormalization",shaderCache:{hint:`${c}`,inputDependencies:b},getRunData:()=>({outputs:[{dims:o,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(p/64)},programUniforms:[{type:12,data:p},...L(g,y,g)]}),getShaderSource:w},{inputs:[e[0],m]})},Vg=(t,e,r)=>{let n=e[0].dims,o=n,i=n[0],s=n[n.length-1],u=k.sizeFromDimension(n,1)/s,d=fe(s),c=k.size(o)/d,p=[{type:12,data:u},{type:12,data:Math.floor(s/d)}],m=["type","type"],g=!1,y=[0,n.length-1];for(let x=0;x<n.length-2;x++)g=g||n[x+1]!==1,y.push(x+1);g=g&&n[n.length-1]!==1;let b=g?t.compute(Oe(t.inputs[0],y),{inputs:[t.inputs[0]],outputs:[-1]})[0]:t.inputs[0].reshape(Array.from({length:n.length},(x,$)=>n[y[$]])),w=Dl(t,b,e[1],e[2],i,u,s,r.epsilon),S=x=>{let $=ye(e[0].dataType),T=d===1?"vec2f":`mat${d}x2f`,I=z=>{let v=z===0?"x":"y",M=d===1?"f32":`vec${d}f`;switch(d){case 1:return`${$}(${M}(scale.${v}))`;case 2:return`vec2<${$}>(${M}(scale[0].${v}, scale[1].${v}))`;case 4:return`vec4<${$}>(${M}(scale[0].${v}, scale[1].${v}, scale[2].${v}, scale[3].${v}))`;default:throw new Error(`Not supported compoents ${d}`)}},E=O("input",e[0].dataType,e[0].dims,d),A=R("output",e[0].dataType,o,d);return`
  @group(0) @binding(0) var<storage, read> input : array<${E.type.storage}>;
  @group(0) @binding(1) var<storage, read> scale_input : array<${T}>;
  @group(0) @binding(2) var<storage, read_write> output : array<${A.type.storage}>;
  struct Uniforms {H: u32, C : u32};
  @group(0) @binding(3) var<uniform> uniforms: Uniforms;

  ${x.mainStart()}
    let current_image_number = global_idx / (uniforms.C * uniforms.H);
    let current_channel_number = global_idx % uniforms.C;

    let scale_offset = current_image_number * uniforms.C + current_channel_number;
    let scale = scale_input[scale_offset];
    output[global_idx] = fma(input[global_idx], ${I(0)}, ${I(1)});
  }`};t.compute({name:"InstanceNormalizationNHWC",shaderCache:{hint:`${d}`,inputDependencies:m},getRunData:()=>({outputs:[{dims:o,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(c/64)},programUniforms:p}),getShaderSource:S},{inputs:[e[0],w]})},Bl=(t,e)=>{e.format==="NHWC"?Vg(t,t.inputs,e):Ng(t,t.inputs,e)}});var Lg,Wg,Rl,Ul=V(()=>{"use strict";J();ne();ae();Lg=t=>{if(!t||t.length<2)throw new Error("layerNorm requires at least 2 inputs.")},Wg=(t,e,r)=>{let n=e.simplified,o=t[0].dims,i=t[1],s=!n&&t[2],u=o,d=k.normalizeAxis(e.axis,o.length),c=k.sizeToDimension(o,d),p=k.sizeFromDimension(o,d),m=k.size(i.dims),g=s?k.size(s.dims):0;if(m!==p||s&&g!==p)throw new Error(`Size of X.shape()[axis:] == ${p}.
       Size of scale and bias (if provided) must match this.
       Got scale size of ${m} and bias size of ${g}`);let y=[];for(let E=0;E<o.length;++E)E<d?y.push(o[E]):y.push(1);let b=fe(p),w=["type","type"],S=[{type:12,data:c},{type:1,data:p},{type:12,data:Math.floor(p/b)},{type:1,data:e.epsilon}];s&&w.push("type");let x=r>1,$=r>2,T=E=>{let A=ye(t[0].dataType),z=[O("x",t[0].dataType,t[0].dims,b),O("scale",i.dataType,i.dims,b)];s&&z.push(O("bias",s.dataType,s.dims,b)),z.push(R("output",t[0].dataType,u,b)),x&&z.push(R("mean_data_output",1,y)),$&&z.push(R("inv_std_output",1,y));let v=[{name:"norm_count",type:"u32"},{name:"norm_size",type:"f32"},{name:"norm_size_vectorized",type:"u32"},{name:"epsilon",type:"f32"}];return`
  ${E.registerUniforms(v).declareVariables(...z)}
  ${E.mainStart()}
    ${E.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.norm_count")}
    let offset = global_idx * uniforms.norm_size_vectorized;
    var mean_vector = ${fo("f32",b)};
    var mean_square_vector = ${fo("f32",b)};

    for (var h: u32 = 0u; h < uniforms.norm_size_vectorized; h++) {
      let value = ${Bt(A,b,"x[h + offset]")};
      mean_vector += value;
      mean_square_vector += value * value;
    }
    let mean = ${je("mean_vector",b)} / uniforms.norm_size;
    let inv_std_dev = inverseSqrt(${je("mean_square_vector",b)} / uniforms.norm_size ${n?"":"- mean * mean"} + uniforms.epsilon);

    for (var j: u32 = 0; j < uniforms.norm_size_vectorized; j++) {
      let f32input = ${Bt(A,b,"x[j + offset]")};
      let f32scale = ${Bt(A,b,"scale[j]")};
      output[j + offset] = ${z[0].type.value}((f32input ${n?"":"- mean"}) * inv_std_dev * f32scale
        ${s?`+ ${Bt(A,b,"bias[j]")}`:""}
      );
    }

    ${x?"mean_data_output[global_idx] = mean":""};
    ${$?"inv_std_output[global_idx] = inv_std_dev":""};
  }`},I=[{dims:u,dataType:t[0].dataType}];return x&&I.push({dims:y,dataType:1}),$&&I.push({dims:y,dataType:1}),{name:"LayerNormalization",shaderCache:{hint:`${b};${r};${n}`,inputDependencies:w},getRunData:()=>({outputs:I,dispatchGroup:{x:Math.ceil(c/64)},programUniforms:S}),getShaderSource:T}},Rl=(t,e)=>{Lg(t.inputs),t.compute(Wg(t.inputs,e,t.outputCount))}});var Gg,Nl,Vl=V(()=>{"use strict";ne();sn();un();Gg=t=>{if(!t||t.length!==2)throw new Error("MatMul requires 2 inputs.");if(t[0].dims[t[0].dims.length-1]!==t[1].dims[t[1].dims.length-2])throw new Error("shared dimension does not match.")},Nl=t=>{Gg(t.inputs);let e=ot.calcShape(t.inputs[0].dims,t.inputs[1].dims,!0);if(!e)throw new Error("Can't use matmul on the given tensors");let r=e[e.length-1],n=t.inputs[0].dims[t.inputs[0].dims.length-1];if(r<8&&n<8)t.compute(an(t.inputs,{activation:""},e));else{let o=e[e.length-2],i=k.size(t.inputs[0].dims.slice(0,-2)),s=k.size(t.inputs[1].dims.slice(0,-2));if(i!==1&&o===1&&s===1){let u=t.inputs[0].reshape([1,i,n]),d=t.inputs[1].reshape([1,n,r]),c=[1,i,r],p=[u,d];t.compute(ir(p,{activation:""},e,c),{inputs:p})}else t.compute(ir(t.inputs,{activation:""},e))}}});var Hg,Fg,qg,Ll,Wl,Gl=V(()=>{"use strict";J();ne();Ie();ae();Hg=(t,e)=>{if(t.length<3||t.length>4)throw new Error("MatMulNBits requires 3 or 4 inputs");let r=t[0],n=r.dims.length;if(r.dims[n-1]!==e.k)throw new Error("The last dim of input shape does not match the k value");let o=Math.floor((e.k+e.blockSize-1)/e.blockSize),i=e.blockSize/8*e.bits,s=t[1];if(!k.areEqual(s.dims,[e.n,o,i]))throw new Error("The second inputs must be 3D tensor with shape N X nBlocksPerCol X blobSize");let d=t[2].dims;if(k.size(d)!==e.n*o)throw new Error("scales input size error.");if(t.length===4){let p=t[3].dims,m=e.n*(e.bits===8?o:Math.floor((o*e.bits+7)/8));if(k.size(p)!==m)throw new Error("zeroPoints input size error.")}},Fg=(t,e)=>{let r=t[0].dims,n=r.length,o=r[n-2],i=e.k,s=e.n,u=r.slice(0,n-2),d=k.size(u),p=t[1].dims[2]/4,m=t[0].dataType,g=fe(e.k),y=fe(p),b=fe(s),w=u.concat([o,s]),S=o>1&&s/b%2===0?2:1,x=k.size(w)/b/S,$=64,T=[],I=[d,o,i/g],E=k.convertShape(t[1].dims).slice();E.splice(-1,1,p/y),T.push(...L(I)),T.push(...L(E)),T.push(...L(t[2].dims)),t.length===4&&T.push(...L(k.convertShape(t[3].dims)));let A=[d,o,s/b];T.push(...L(A));let z=v=>{let M=I.length,N=O("a",t[0].dataType,M,g),K=O("b",12,E.length,y),q=O("scales",t[2].dataType,t[2].dims.length),Q=[N,K,q],D=t.length===4?O("zero_points",12,t[3].dims.length):void 0;D&&Q.push(D);let W=A.length,j=R("output",t[0].dataType,W,b),Y=ye(t[0].dataType),Z=(()=>{switch(g){case 1:return`array<${Y}, 8>`;case 2:return`mat4x2<${Y}>`;case 4:return`mat2x4<${Y}>`;default:throw new Error(`${g}-component is not supported.`)}})(),te=()=>{let Te=`
          // reuse a data
            var input_offset = ${N.indicesToOffset(`${N.type.indices}(batch, row, word_offset)`)};
            var a_data: ${Z};
            for (var j: u32 = 0; j < ${8/g}; j++) {
              a_data[j] = ${N.getByOffset("input_offset")};
              input_offset++;
            }
          `;for(let re=0;re<b*S;re++)Te+=`
            b_value = ${y===1?`b${re}_data`:`b${re}_data[i]`};
            b_value_lower = unpack4xU8(b_value & b_mask);
            b_value_upper = unpack4xU8((b_value >> 4) & b_mask);
            b_quantized_values = ${Z}(${Array.from({length:4},(U,X)=>`${Y}(b_value_lower[${X}]), ${Y}(b_value_upper[${X}])`).join(", ")});
            b_dequantized_values = ${g===1?`${Z}(${Array.from({length:8},(U,X)=>`(b_quantized_values[${X}] - ${D?`zero_point${re}`:"zero_point"}) * scale${re}`).join(", ")});`:`(b_quantized_values - ${Z}(${Array(8).fill(`${D?`zero_point${re}`:"zero_point"}`).join(",")})) * scale${re};`};
            workgroup_shared[local_id.x * ${S} + ${Math.floor(re/b)}]${b>1?`[${re%b}]`:""} += ${Array.from({length:8/g},(U,X)=>`${g===1?`a_data[${X}] * b_dequantized_values[${X}]`:`dot(a_data[${X}], b_dequantized_values[${X}])`}`).join(" + ")};
          `;return Te},ie=()=>{let Te=`
            var col_index = col * ${b};
            ${D?`
            let zero_point_bytes_per_col = (nBlocksPerCol + 1) / 2;
            var zero_point_byte_count: u32;
            var zero_point_word_index: u32;
            var zero_point_byte_offset: u32;
            let zero_point_nibble_offset: u32 = block & 0x1u;
            var zero_point_bits_offset: u32;
            var zero_point_word: u32;`:`
            // The default zero point is 8 for unsigned 4-bit quantization.
            let zero_point = ${Y}(8);`}
            `;for(let re=0;re<b*S;re++)Te+=`
            let scale${re} = ${q.getByOffset("col_index * nBlocksPerCol + block")};
            ${D?`
            zero_point_byte_count = col_index * zero_point_bytes_per_col + (block >> 0x1u);
            zero_point_word_index = zero_point_byte_count >> 0x2u;
            zero_point_byte_offset = zero_point_byte_count & 0x3u;
            zero_point_bits_offset = (zero_point_byte_offset << 3) + (zero_point_nibble_offset << 2);
            zero_point_word = ${D.getByOffset("zero_point_word_index")} >> zero_point_bits_offset;
            let zero_point${re} = ${Y}((zero_point_word) & 0xFu);`:""}
            col_index += 1;`;return Te},we=()=>{let Te=`col_index = col * ${b};`;for(let re=0;re<b*S;re++)Te+=`
            let b${re}_data = ${K.getByIndices(`${K.type.indices}(col_index, block, word)`)};
            col_index += 1;`;return Te+=`
            var b_value: u32;
            let b_mask: u32 = 0x0F0F0F0Fu;
            var b_value_lower: vec4<u32>;
            var b_value_upper: vec4<u32>;
            var b_quantized_values: ${Z};
            var b_dequantized_values: ${Z};`,Te};return`
        var<workgroup> workgroup_shared: array<${j.type.value}, ${S*$}>;
        ${v.declareVariables(...Q,j)}
        ${v.mainStart([$,1,1])}
          let output_indices = ${j.offsetToIndices(`(global_idx / ${$}) * ${S}`)};
          let col = output_indices[2];
          let row = output_indices[1];
          let batch = output_indices[0];
          let nBlocksPerCol = uniforms.b_shape[1];

          for (var block = local_id.x; block < nBlocksPerCol; block += ${$}) {
            //process one block
            var word_offset: u32 = block * ${e.blockSize/g};
            ${ie()}
            for (var word: u32 = 0; word < ${p}; word += ${y}) {
              ${we()}
              for (var i: u32 = 0; i < ${y}; i++) {
                ${te()}
                word_offset += ${8/g};
              }
            }
          }
          workgroupBarrier();

          if (local_id.x < ${S}) {
            var output_value: ${j.type.value} = ${j.type.value}(0);
            var workgroup_shared_offset: u32 = local_id.x;
            for (var b: u32 = 0u; b < ${$}u; b++) {
              output_value += workgroup_shared[workgroup_shared_offset];
              workgroup_shared_offset += ${S};
            }
            ${j.setByIndices(`${j.type.indices}(batch, row, col + local_id.x)`,"output_value")};
          }
        }`};return{name:"MatMulNBits",shaderCache:{hint:`${e.blockSize};${e.bits};${g};${y};${b};${S};${$}`,inputDependencies:Array(t.length).fill("rank")},getRunData:()=>({outputs:[{dims:w,dataType:m}],dispatchGroup:{x},programUniforms:T}),getShaderSource:z}},qg=(t,e)=>{let r=t[0].dims,n=r.length,o=r[n-2],i=e.k,s=e.n,u=r.slice(0,n-2),d=k.size(u),p=t[1].dims[2]/4,m=t[0].dataType,g=fe(e.k),y=fe(p),b=u.concat([o,s]),w=128,S=s%8===0?8:s%4===0?4:1,x=w/S,$=x*y*8,T=$/g,I=$/e.blockSize,E=k.size(b)/S,A=[],z=[d,o,i/g],v=k.convertShape(t[1].dims).slice();v.splice(-1,1,p/y),A.push(...L(z)),A.push(...L(v)),A.push(...L(t[2].dims)),t.length===4&&A.push(...L(k.convertShape(t[3].dims)));let M=[d,o,s];A.push(...L(M));let N=K=>{let q=z.length,Q=O("a",t[0].dataType,q,g),D=O("b",12,v.length,y),W=O("scales",t[2].dataType,t[2].dims.length),j=[Q,D,W],Y=t.length===4?O("zero_points",12,t[3].dims.length):void 0;Y&&j.push(Y);let Z=M.length,te=R("output",t[0].dataType,Z),ie=ye(t[0].dataType),we=()=>{switch(g){case 1:return`
          let a_data0 = vec4<${ie}>(sub_a[word_offset], sub_a[word_offset + 1], sub_a[word_offset + 2], sub_a[word_offset + 3]);
          let a_data1 = vec4<${ie}>(sub_a[word_offset + 4], sub_a[word_offset + 5], sub_a[word_offset + 6], sub_a[word_offset + 7]);`;case 2:return`
          let a_data0 = vec4<${ie}>(sub_a[word_offset], sub_a[word_offset + 1]);
          let a_data1 = vec4<${ie}>(sub_a[word_offset + 2], sub_a[word_offset + 3]);`;case 4:return`
          let a_data0 = sub_a[word_offset];
          let a_data1 = sub_a[word_offset + 1];`;default:throw new Error(`${g}-component is not supported.`)}};return`
        var<workgroup> sub_a: array<${Q.type.value}, ${T}>;
        var<workgroup> inter_results: array<array<${te.type.value}, ${x}>, ${S}>;
        ${K.declareVariables(...j,te)}
        ${K.mainStart([x,S,1])}
          let output_indices = ${te.offsetToIndices(`workgroup_index * ${S}`)};
          let col = output_indices[2];
          let row = output_indices[1];
          let batch = output_indices[0];
          let n_blocks_per_col = uniforms.b_shape[1];
          let num_tiles =  (n_blocks_per_col - 1) / ${I} + 1;

          // Loop over shared dimension.
          for (var tile: u32 = 0; tile < num_tiles; tile += 1) {
            let a_col_start = tile * ${T};
            // load one tile A data into shared memory.
            for (var a_offset = local_idx; a_offset < ${T}; a_offset += ${w})
            {
              let a_col = a_col_start + a_offset;
              if (a_col < uniforms.a_shape[2])
              {
                sub_a[a_offset] = ${Q.getByIndices(`${Q.type.indices}(batch, row, a_col)`)};
              } else {
                sub_a[a_offset] = ${Q.type.value}(0);
              }
            }
            workgroupBarrier();

            // each thread process one block
            let b_row = col + local_id.y;
            let block = tile * ${I} + local_id.x;
            ${Y?`
            let zero_point_bytes_per_col = (n_blocks_per_col + 1) / 2;
            let zero_point_byte_count = b_row * zero_point_bytes_per_col + (block >> 0x1u);
            let zero_point_word_index = zero_point_byte_count >> 0x2u;
            let zero_point_byte_offset = zero_point_byte_count & 0x3u;
            let zero_point_nibble_offset: u32 = block & 0x1u;
            let zero_point_bits_offset = (zero_point_byte_offset << 3) + (zero_point_nibble_offset << 2);
            let zero_point_word = ${Y.getByOffset("zero_point_word_index")} >> zero_point_bits_offset;
            let zero_point = ${ie}((zero_point_word) & 0xFu);`:`
            // The default zero point is 8 for unsigned 4-bit quantization.
            let zero_point = ${ie}(8);`}
            let scale = ${W.getByOffset("b_row * n_blocks_per_col + block")};
            let b_data = ${D.getByIndices(`${D.type.indices}(b_row, block, 0)`)};
            var word_offset = local_id.x * ${e.blockSize/g};
            for (var i: u32 = 0; i < ${y}; i++) {
              ${we()}
              let b_value = ${y===1?"b_data":"b_data[i]"};
              let b_value_lower = unpack4xU8(b_value & 0x0F0F0F0Fu);
              let b_value_upper = unpack4xU8((b_value >> 4) & 0x0F0F0F0Fu);
              let b_quantized_values = mat2x4<${ie}>(${Array.from({length:4},(Te,re)=>`${ie}(b_value_lower[${re}]), ${ie}(b_value_upper[${re}])`).join(", ")});
              let b_dequantized_values = (b_quantized_values - mat2x4<${ie}>(${Array(8).fill("zero_point").join(",")})) * scale;
              inter_results[local_id.y][local_id.x] += ${Array.from({length:2},(Te,re)=>`${`dot(a_data${re}, b_dequantized_values[${re}])`}`).join(" + ")};
              word_offset += ${8/g};
            }
            workgroupBarrier();
          }

          if (local_idx < ${S}) {
            var output_value: ${te.type.value} = ${te.type.value}(0);
            for (var b = 0u; b < ${x}; b++) {
              output_value += inter_results[local_idx][b];
            }
            if (col + local_idx < uniforms.output_shape[2])
            {
              ${te.setByIndices(`${te.type.indices}(batch, row, col + local_idx)`,"output_value")}
            }
          }
        }`};return{name:"BlockwiseMatMulNBits32",shaderCache:{hint:`${e.blockSize};${g};${y};${x};${S}`,inputDependencies:Array(t.length).fill("rank")},getRunData:()=>({outputs:[{dims:b,dataType:m}],dispatchGroup:{x:E},programUniforms:A}),getShaderSource:N}},Ll=(t,e)=>{Hg(t.inputs,e),e.blockSize===32&&t.adapterInfo.isVendor("intel")&&t.adapterInfo.isArchitecture("gen-12lp")?t.compute(qg(t.inputs,e)):t.compute(Fg(t.inputs,e))},Wl=t=>ee(t)});var Kg,jg,Zg,Qg,Yg,Xg,Jg,eb,Hl,Fl=V(()=>{"use strict";J();ne();ae();Kg=t=>{if(!t||t.length<1)throw new Error("Too few inputs");if(t[0].dataType!==1&&t[0].dataType!==10)throw new Error("Input type must be float or float16.");if(t.length>=2){let e=t[0].dims.length*2===t[1].dims[0];if(t.length===4&&(e=t[3].dims[0]*2===t[1].dims[0]),!e)throw new Error("The pads should be a 1D tensor of shape [2 * input_rank] or [2 * num_axes].")}},jg=(t,e,r)=>{let n="";for(let o=e-1;o>=0;--o)n+=`
            k = i32(${t.indicesGet("indices",o)}) - ${F("uniforms.pads",o,r)};
            if (k < 0) {
              break;
            }
            if (k >= i32(${F("uniforms.x_shape",o,e)})) {
              break;
            }
            offset += k * i32(${F("uniforms.x_strides",o,e)});
        `;return`
          value = ${t.type.value}(uniforms.constant_value);
          for (var i = 0; i < 1; i++) {
            var offset = 0;
            var k = 0;
            ${n}
            value = x[offset];
          }
      `},Zg=(t,e,r)=>{let n="";for(let o=e-1;o>=0;--o)n+=`
                k = i32(${t.indicesGet("indices",o)}) - ${F("uniforms.pads",o,r)};
                if (k < 0) {
                  k = -k;
                }
                {
                  let _2n_1 = 2 * (i32(${F("uniforms.x_shape",o,e)}) - 1);
                  k = k % _2n_1;
                  if(k >= i32(${F("uniforms.x_shape",o,e)})) {
                    k = _2n_1 - k;
                  }
                }
                offset += k * i32(${F("uniforms.x_strides",o,e)});
            `;return`
              var offset = 0;
              var k = 0;
              ${n}
              value = x[offset];
          `},Qg=(t,e,r)=>{let n="";for(let o=e-1;o>=0;--o)n+=`
                k = i32(${t.indicesGet("indices",o)}) - ${F("uniforms.pads",o,r)};
                if (k < 0) {
                  k = 0;
                }
                if (k >= i32(${F("uniforms.x_shape",o,e)})) {
                  k = i32(${F("uniforms.x_shape",o,e)}) - 1;
                }
                offset += k * i32(${F("uniforms.x_strides",o,e)});
            `;return`
              var offset = 0;
              var k = 0;
              ${n}
              value = x[offset];
          `},Yg=(t,e,r)=>{let n="";for(let o=e-1;o>=0;--o)n+=`
                k = i32(${t.indicesGet("indices",o)}) - ${F("uniforms.pads",o,r)};
                if (k < 0)  {
                  k += i32(${F("uniforms.x_shape",o,e)}]);
                }
                if (k >= i32(${F("uniforms.x_shape",o,e)})) {
                  k -= i32(${F("uniforms.x_shape",o,e)});
                }
                offset += k * i32(${F("uniforms.x_strides",o,e)});
            `;return`
              var offset = 0;
              var k = 0;
              ${n}
              value = x[offset];
          `},Xg=(t,e,r)=>{switch(r.mode){case 0:return jg(t,e,r.pads.length);case 1:return Zg(t,e,r.pads.length);case 2:return Qg(t,e,r.pads.length);case 3:return Yg(t,e,r.pads.length);default:throw new Error("Invalid mode")}},Jg=(t,e)=>{let r=k.padShape(t[0].dims.slice(),e.pads),n=t[0].dims,o=k.size(r),i=[{type:12,data:o},{type:6,data:e.pads}],s=t.length>=3&&t[2].data;e.mode===0&&i.push({type:s?t[2].dataType:1,data:e.value}),i.push(...L(t[0].dims,r));let u=["rank"],d=c=>{let p=R("output",t[0].dataType,r.length),m=O("x",t[0].dataType,n.length),g=m.type.value,y=Xg(p,n.length,e),b=[{name:"output_size",type:"u32"},{name:"pads",type:"i32",length:e.pads.length}];return e.mode===0&&b.push({name:"constant_value",type:s?g:"f32"}),`
            ${c.registerUniforms(b).declareVariables(m,p)}
            ${c.mainStart()}
            ${c.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

            let indices = ${p.offsetToIndices("global_idx")};

            var value = ${g}(0);
            ${y}
            output[global_idx] = value;
        }`};return{name:"Pad",shaderCache:{hint:`${e.mode}${s}`,inputDependencies:u},getRunData:()=>({outputs:[{dims:r,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(k.size(r)/64)},programUniforms:i}),getShaderSource:d}},eb=(t,e)=>{if(t.length>1){let r=t[1].getBigInt64Array(),n=t.length>=3&&t[2].data?t[2].dataType===10?t[2].getUint16Array()[0]:t[2].getFloat32Array()[0]:0,o=t[0].dims.length,i=new Int32Array(2*o).fill(0);if(t.length>=4){let u=t[3].getBigInt64Array();for(let d=0;d<u.length;d++)i[Number(u[d])]=Number(r[d]),i[Number(u[d])+o]=Number(r[d+u.length])}else r.forEach((u,d)=>i[Number(d)]=Number(u));let s=[];return i.forEach(u=>s.push(u)),{mode:e.mode,value:n,pads:s}}else return e},Hl=(t,e)=>{Kg(t.inputs);let r=eb(t.inputs,e);t.compute(Jg(t.inputs,r),{inputs:[0]})}});var pn,ql,Kl,jl,Zl,tb,rb,Ql,Yl,Xl,Jl,ec,tc,rc,nc,oc,ic,ac,sc,uc=V(()=>{"use strict";Ve();J();ne();ae();pn=t=>{if(be.webgpu.validateInputContent&&(!t||t.length!==1))throw new Error("Pool ops requires 1 input.")},ql=(t,e,r)=>{let n=e.format==="NHWC",o=t.dims.slice();n&&o.splice(1,0,o.pop());let i=Object.hasOwnProperty.call(e,"dilations"),s=e.kernelShape.slice(),u=e.strides.slice(),d=i?e.dilations.slice():[],c=e.pads.slice();zt.adjustPoolAttributes(r,o,s,u,d,c);let p=zt.computePoolOutputShape(r,o,u,d,s,c,e.autoPad),m=Object.assign({},e);i?Object.assign(m,{kernelShape:s,strides:u,pads:c,dilations:d,cacheKey:e.cacheKey}):Object.assign(m,{kernelShape:s,strides:u,pads:c,cacheKey:e.cacheKey});let g=p.slice();return g.push(g.splice(1,1)[0]),[m,n?g:p]},Kl=(t,e)=>{let r=e.format==="NHWC",n=k.size(t),o=k.size(e.kernelShape),i=[{type:12,data:n},{type:12,data:o}],s=[{name:"outputSize",type:"u32"},{name:"kernelSize",type:"u32"}];if(e.kernelShape.length<=2){let u=e.kernelShape[e.kernelShape.length-1],d=e.strides[e.strides.length-1],c=e.pads[e.pads.length/2-1],p=e.pads[e.pads.length-1],m=!!(c+p);i.push({type:12,data:u},{type:12,data:d},{type:12,data:c},{type:12,data:p}),s.push({name:"kw",type:"u32"},{name:"sw",type:"u32"},{name:"pwStart",type:"u32"},{name:"pwEnd",type:"u32"});let g=!1;if(e.kernelShape.length===2){let y=e.kernelShape[e.kernelShape.length-2],b=e.strides[e.strides.length-2],w=e.pads[e.pads.length/2-2],S=e.pads[e.pads.length-2];g=!!(w+S),i.push({type:12,data:y},{type:12,data:b},{type:12,data:w},{type:12,data:S}),s.push({name:"kh",type:"u32"},{name:"sh",type:"u32"},{name:"phStart",type:"u32"},{name:"phEnd",type:"u32"})}return[i,s,!0,m,g]}else{if(r)throw new Error("Pooling with kernelShape.length > 2 is not supported for NHWC format.");let u=k.computeStrides(e.kernelShape);i.push({type:12,data:u},{type:12,data:e.pads},{type:12,data:e.strides}),s.push({name:"kernelStrides",type:"u32",length:u.length},{name:"pads",type:"u32",length:e.pads.length},{name:"strides",type:"u32",length:e.strides.length});let d=e.pads.reduce((c,p)=>c+p);return[i,s,!!d,!1,!1]}},jl=(t,e,r,n,o,i,s,u,d,c,p,m)=>{let g=o.format==="NHWC",y=e.type.value,b=R("output",e.type.tensor,n);if(o.kernelShape.length<=2){let w="",S="",x="",$=r-(g?2:1);if(p?w=`
                for (var i: u32 = 0u; i < uniforms.kw; i++) {
                  xIndices[${$}] = indices[${$}] * uniforms.sw - uniforms.pwStart + i;
                  if (xIndices[${$}] < 0 || xIndices[${$}]
                      >= uniforms.x_shape[${$}]) {
                    pad++;
                    continue;
                  }
                  let x_val = x[${e.indicesToOffset("xIndices")}];
                  ${i}
                }`:w=`
                for (var i: u32 = 0u; i < uniforms.kw; i++) {
                  xIndices[${$}] = indices[${$}] * uniforms.sw - uniforms.pwStart + i;
                  let x_val = x[${e.indicesToOffset("xIndices")}];
                  ${i}
                }`,o.kernelShape.length===2){let I=r-(g?3:2);m?S=`
                for (var j: u32 = 0u; j < uniforms.kh; j++) {
                  xIndices[${I}] = indices[${I}] * uniforms.sh - uniforms.phStart + j;
                  if (xIndices[${I}] < 0 || xIndices[${I}] >= uniforms.x_shape[${I}]) {
                    pad += i32(uniforms.kw);
                    continue;
                  }
              `:S=`
                for (var j: u32 = 0u; j < uniforms.kh; j++) {
                  xIndices[${I}] = indices[${I}] * uniforms.sh - uniforms.phStart + j;
                `,x=`
              }
            `}return`
            ${t.registerUniforms(d).declareVariables(e,b)}

            ${t.mainStart()}
              ${t.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

              let indices = ${b.offsetToIndices("global_idx")};
              var xIndices = ${b.offsetToIndices("global_idx")};

              var value = ${y}(${u});
              var pad = 0;
              ${S}
              ${w}
              ${x}
              ${s}

              output[global_idx] = value;
            }`}else{if(g)throw new Error("Pooling with kernelShape.length > 2 is not supported for NHWC format.");let w=o.kernelShape.length,S=o.pads.length,x="";return c?x=`
                if (xIndices[j] >= uniforms.x_shape[j]) {
                  pad++;
                  isPad = true;
                  break;
                }
              }
              if (!isPad) {
                let x_val = x[${e.indicesToOffset("xIndices")}];
                ${i}
              }`:x=`
              }
              let x_val = x[${e.indicesToOffset("xIndices")}];
              ${i}
            `,`
            ${t.registerUniforms(d).declareVariables(e,b)}

            ${t.mainStart()}
              ${t.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
              let indices = ${b.offsetToIndices("global_idx")};
              var xIndices = ${b.offsetToIndices("global_idx")};

              var offsets: array<u32, ${w}>;

              var value = ${y}(${u});
              var pad = 0;
              var isPad = false;

              for (var i: u32 = 0u; i < uniforms.kernelSize; i++) {
                var offset = i;
                for (var j = 0u; j < ${w-1}u; j++) {
                  offsets[j] = offset / ${F("uniforms.kernelStrides","j",w)};
                  offset -= offsets[j] * ${F("uniforms.kernelStrides","j",w)};
                }
                offsets[${w-1}] = offset;

                isPad = false;
                for (var j = ${r-w}u; j < ${r}u; j++) {
                  xIndices[j] = indices[j] * ${F("uniforms.strides",`j - ${r-w}u`,w)}
                    + offsets[j - ${r-w}u] - ${F("uniforms.pads","j - 2u",S)};
                  ${x}
              }
              ${s}

              output[global_idx] = value;
            }`}},Zl=t=>`${t.format};${t.ceilMode};${t.autoPad};${t.kernelShape.length}`,tb=t=>`${Zl(t)};${t.countIncludePad}`,rb=t=>`${Zl(t)};${t.storageOrder};${t.dilations}`,Ql=t=>({format:t.format,autoPad:["NOTSET","VALID","SAME_UPPER","SAME_LOWER"][t.auto_pad],ceilMode:t.ceil_mode,kernelShape:t.kernel_shape,strides:t.strides,pads:t.pads}),Yl=(t,e,r,n)=>{let[o,i]=ql(e,n,r),s=O("x",e.dataType,e.dims.length),u=s.type.value,d="value += x_val;",c="";o.countIncludePad?c+=`value /= ${u}(uniforms.kernelSize);`:c+=`value /= ${u}(i32(uniforms.kernelSize) - pad);`;let[p,m,g,y,b]=Kl(i,o);p.push(...L(e.dims,i));let w=["rank"];return{name:t,shaderCache:{hint:`${n.cacheKey};${g};${y};${b}`,inputDependencies:w},getRunData:()=>({outputs:[{dims:i,dataType:e.dataType}],dispatchGroup:{x:Math.ceil(k.size(i)/64)},programUniforms:p}),getShaderSource:S=>jl(S,s,e.dims.length,i.length,o,d,c,0,m,g,y,b)}},Xl=t=>{let e=t.count_include_pad!==0,r=Ql(t);if(r.ceilMode!==0)throw new Error("using ceil() in shape computation is not yet supported for AveragePool");let n={countIncludePad:e,...r,cacheKey:""};return{...n,cacheKey:tb(n)}},Jl=(t,e)=>{pn(t.inputs),t.compute(Yl("AveragePool",t.inputs[0],!1,e))},ec={autoPad:"",ceilMode:0,countIncludePad:!1,kernelShape:[],strides:[],pads:[],storageOrder:0,dilations:[]},tc=t=>{let e=t.format;return{format:e,...ec,cacheKey:e}},rc=(t,e)=>{pn(t.inputs),t.compute(Yl("GlobalAveragePool",t.inputs[0],!0,e))},nc=(t,e,r,n)=>{let[o,i]=ql(e,n,r),s=`
      value = max(x_val, value);
    `,u="",d=O("x",e.dataType,e.dims.length),c=["rank"],[p,m,g,y,b]=Kl(i,o);return p.push(...L(e.dims,i)),{name:t,shaderCache:{hint:`${n.cacheKey};${g};${y};${b}`,inputDependencies:c},getRunData:()=>({outputs:[{dims:i,dataType:e.dataType}],dispatchGroup:{x:Math.ceil(k.size(i)/64)},programUniforms:p}),getShaderSource:w=>jl(w,d,e.dims.length,i.length,o,s,u,e.dataType===10?-65504:-1e5,m,g,y,b)}},oc=(t,e)=>{pn(t.inputs),t.compute(nc("MaxPool",t.inputs[0],!1,e))},ic=t=>{let e=t.storage_order,r=t.dilations,n=Ql(t);if(e!==0)throw new Error("column major storage order is not yet supported for MaxPool");if(n.ceilMode!==0)throw new Error("using ceil() in shape computation is not yet supported for MaxPool");let o={storageOrder:e,dilations:r,...n,cacheKey:""};return{...o,cacheKey:rb(o)}},ac=t=>{let e=t.format;return{format:e,...ec,cacheKey:e}},sc=(t,e)=>{pn(t.inputs),t.compute(nc("GlobalMaxPool",t.inputs[0],!0,e))}});var ob,ib,dc,lc,cc=V(()=>{"use strict";J();ne();Ie();ae();ob=(t,e)=>{if(t.length<2||t.length>3)throw new Error("DequantizeLinear requires 2 or 3 inputs.");if(t.length===3&&t[1].dims===t[2].dims)throw new Error("x-scale and x-zero-point must have the same shape.");if(t.length===3&&t[0].dataType!==t[2].dataType)throw new Error("x and x-zero-point must have the same data type.");if(t[0].dataType===6&&t.length>2)throw new Error("In the case of dequantizing int32 there is no zero point.");if(t[1].dims.length!==0&&t[1].dims.length!==1&&t[1].dims.length!==t[0].dims.length)throw new Error("scale input must be a scalar, a 1D tensor, or have the same rank as the input tensor.");if(t.length>2){if(t[0].dataType!==t[2].dataType)throw new Error("x and x-zero-point must have the same data type.");if(t[1].dims.length!==t[2].dims.length)throw new Error("scale and zero-point inputs must have the same rank.");if(!t[1].dims.map((r,n)=>r===t[2].dims[n]).reduce((r,n)=>r&&n,!0))throw new Error("scale and zero-point inputs must have the same shape.")}if(e.blockSize>0){if(t[1].dims.length===0||t[1].dims.length===1&&t[1].dims[0]===1)throw new Error("blockSize must be set only for block quantization.");if(!t[1].dims.map((o,i)=>i===e.axis||o===t[0].dims[i]).reduce((o,i)=>o&&i,!0))throw new Error("For block qunatization, scale input shape to match the input shape except for the axis");if(t[1].dims.length!==t[0].dims.length)throw new Error("For block qunatization the scale input rank must be the same as the x rank.");let r=t[0].dims[e.axis],n=t[1].dims[e.axis];if(e.blockSize<Math.ceil(r/n)||e.blockSize>Math.ceil(r/(n-1)-1))throw new Error("blockSize must be with in the range [ceil(dI / Si), ceil(dI / (Si - 1) - 1)].")}},ib=(t,e)=>{let r=k.normalizeAxis(e.axis,t[0].dims.length),n=t[0].dataType,o=n===3,i=t[0].dims,s=t[1].dataType,u=k.size(i),d=n===3||n===2,c=d?[Math.ceil(k.size(t[0].dims)/4)]:t[0].dims,p=t[1].dims,m=t.length>2?t[2]:void 0,g=m?d?[Math.ceil(k.size(m.dims)/4)]:m.dims:void 0,y=p.length===0||p.length===1&&p[0]===1,b=y===!1&&p.length===1,w=fe(u),S=y&&(!d||w===4),x=S?w:1,$=S&&!d?w:1,T=O("input",d?12:n,c.length,$),I=O("scale",s,p.length),E=m?O("zero_point",d?12:n,g.length):void 0,A=R("output",s,i.length,x),z=[T,I];E&&z.push(E);let v=[c,p];m&&v.push(g);let M=[{type:12,data:u/x},{type:12,data:r},{type:12,data:e.blockSize},...L(...v,i)],N=K=>{let q=[{name:"output_size",type:"u32"},{name:"axis",type:"u32"},{name:"block_size",type:"u32"}];return`
      ${K.registerUniforms(q).declareVariables(...z,A)}
      ${K.mainStart()}
          ${K.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
          let output_indices = ${A.offsetToIndices("global_idx")};

          // Set input x
          ${d?`
            let input = ${T.getByOffset("global_idx / 4")};
            let x_vec = ${o?"unpack4xI8(input)":"unpack4xU8(input)"};
            let x_value = ${x===1?"x_vec[global_idx % 4]":"x_vec"};`:`let x_value = ${T.getByOffset("global_idx")};`};

          // Set scale input
          ${y?`let scale_value= ${I.getByOffset("0")}`:b?`
            let scale_index = ${A.indicesGet("output_indices","uniforms.axis")};
            let scale_value= ${I.getByOffset("scale_index")};`:`
            var scale_indices: ${I.type.indices} = output_indices;
            let index = ${I.indicesGet("scale_indices","uniforms.axis")} / uniforms.block_size;
            ${I.indicesSet("scale_indices","uniforms.axis","index")};
            let scale_value= ${I.getByIndices("scale_indices")};`};

          // Set zero-point input
          ${E?y?d?`
                let zero_point_input = ${E.getByOffset("0")};
                let zero_point_vec =  ${o?"unpack4xI8(zero_point_input)":"unpack4xU8(zero_point_input)"};
                let zero_point_value= zero_point_vec[0]`:`let zero_point_value = ${E.getByOffset("0")}`:b?d?`
                let zero_point_index = ${A.indicesGet("output_indices","uniforms.axis")};
                let zero_point_input = ${E.getByOffset("zero_point_index / 4")};
                let zero_point_vec =  ${o?"unpack4xI8(zero_point_input)":"unpack4xU8(zero_point_input)"};
                let zero_point_value = zero_point_vec[zero_point_index % 4]`:`
                let zero_point_index = ${A.indicesGet("output_indices","uniforms.axis")};
                let zero_point_value = ${E.getByOffset("zero_point_index")};`:d?`
                let zero_point_offset = ${I.indicesToOffset("scale_indices")};
                let zero_point_input = ${E.getByOffset("zero_point_offset / 4")};
                let zero_point_vec = ${o?"unpack4xI8(zero_point_input)":"unpack4xU8(zero_point_input)"};
                let zero_point_value = zero_point_vec[zero_point_offset % 4];`:`let zero_point_value = ${E.getByIndices("scale_indices")};`:`let zero_point_value = ${d?o?"i32":"u32":T.type.value}(0);`};
      // Compute and write output
      ${A.setByOffset("global_idx",`${A.type.value}(x_value - zero_point_value) * scale_value`)};
      }`};return{name:"DequantizeLinear",shaderCache:{hint:e.cacheKey,inputDependencies:E?["rank","rank","rank"]:["rank","rank"]},getShaderSource:N,getRunData:()=>({outputs:[{dims:i,dataType:s}],dispatchGroup:{x:Math.ceil(u/x/64),y:1,z:1},programUniforms:M})}},dc=(t,e)=>{ob(t.inputs,e),t.compute(ib(t.inputs,e))},lc=t=>ee({axis:t.axis,blockSize:t.blockSize})});var ab,sb,pc,mc=V(()=>{"use strict";Ve();J();ae();ab=(t,e,r)=>{let n=t===e,o=t<e&&r<0,i=t>e&&r>0;if(n||o||i)throw new Error("Range these inputs' contents are invalid.")},sb=(t,e,r,n)=>{let o=Math.abs(Math.ceil((e-t)/r)),i=[o],s=o,u=[{type:12,data:s},{type:n,data:t},{type:n,data:r},...L(i)],d=c=>{let p=R("output",n,i.length),m=p.type.value,g=[{name:"outputSize",type:"u32"},{name:"start",type:m},{name:"delta",type:m}];return`
        ${c.registerUniforms(g).declareVariables(p)}
        ${c.mainStart()}
        ${c.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
        output[global_idx] = uniforms.start + ${m}(global_idx) * uniforms.delta;
      }`};return{name:"Range",shaderCache:{hint:`${n}`},getShaderSource:d,getRunData:()=>({outputs:[{dims:i,dataType:n}],dispatchGroup:{x:Math.ceil(s/64)},programUniforms:u})}},pc=t=>{let e=0,r=0,n=0;t.inputs[0].dataType===6?(e=t.inputs[0].getInt32Array()[0],r=t.inputs[1].getInt32Array()[0],n=t.inputs[2].getInt32Array()[0]):t.inputs[0].dataType===1&&(e=t.inputs[0].getFloat32Array()[0],r=t.inputs[1].getFloat32Array()[0],n=t.inputs[2].getFloat32Array()[0]),be.webgpu.validateInputContent&&ab(e,r,n),t.compute(sb(e,r,n,t.inputs[0].dataType),{inputs:[]})}});var ub,db,fc,hc,gc=V(()=>{"use strict";J();ne();Ie();ae();ub=(t,e,r,n)=>{if(t!=="none"&&n!=="i32"&&n!=="u32"&&n!=="f32")throw new Error(`Input ${n} is not supported with reduction ${t}.`);let o=`{
                var oldValue = 0;
                loop {
                  let newValueF32 =`,i=`;
                  let newValue = bitcast<i32>(newValueF32);
                  let res = atomicCompareExchangeWeak(&${e}, oldValue, newValue);
                  if res.exchanged {
                    break;
                  }
                  oldValue = res.old_value;
                }
              }`;switch(t){case"none":return`${e}=${r};`;case"add":return n==="i32"||n==="u32"?`atomicAdd(&${e}, bitcast<${n}>(${r}));`:`
              ${o}bitcast<${n}>(oldValue) + (${r})${i}`;case"max":return n==="i32"||n==="u32"?`atomicMax(&${e}, bitcast<${n}>(${r}));`:`
                ${o}max(bitcast<f32>(oldValue), (${r}))${i}`;case"min":return n==="i32"||n==="u32"?`atomicMin(&${e}, bitcast<${n}>(${r}));`:`${o}min(bitcast<${n}>(oldValue), (${r}))${i}`;case"mul":return`${o}(bitcast<${n}>(oldValue) * (${r}))${i}`;default:throw new Error(`Reduction ${t} is not supported.`)}},db=(t,e)=>{let r=t[0].dims,n=t[1].dims,o=r,i=1,s=Math.ceil(k.sizeToDimension(n,n.length-1)/i),u=n[n.length-1],d=k.sizeFromDimension(r,u),c=[{type:12,data:s},{type:12,data:u},{type:12,data:d},...L(t[1].dims,t[2].dims,o)],p=m=>{let g=O("indices",t[1].dataType,t[1].dims.length),y=O("updates",t[2].dataType,t[2].dims.length,i),b=e.reduction!=="none"&&e.reduction!==""?Ws("output",t[0].dataType,o.length):R("output",t[0].dataType,o.length,i);return`
      ${m.registerUniform("output_size","u32").registerUniform("last_index_dimension","u32").registerUniform("num_updates_elements","u32").declareVariables(g,y,b)}
      ${m.mainStart()}
        ${m.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
  var data_offset = 0u;
  let indices_start = uniforms.last_index_dimension * global_idx;
  let indices_end = indices_start + uniforms.last_index_dimension;
  for (var i = indices_start; i < indices_end; i++) {
    var index = i32(indices[i].x);
    ${t[0].dims.length===1?`
    let element_count_dim = uniforms.output_strides;
    let dim_value = uniforms.output_shape;`:`
    let element_count_dim = uniforms.output_strides[i - indices_start];
    let dim_value = uniforms.output_shape[i - indices_start];`}
    if (index >= 0) {
      if (index >= i32(dim_value)) {
        index = i32(dim_value - 1);
      }
    } else {
      if (index < -i32(dim_value)) {
        index = 0;
      } else {
        index += i32(dim_value);
      }
    }
    data_offset += u32((u32(index) * element_count_dim));
  }

  for (var i = 0u; i < uniforms.num_updates_elements; i++) {
    let value = updates[uniforms.num_updates_elements * global_idx + i];
    ${ub(e.reduction,"output[data_offset + i]","value",b.type.value)}
  }

      }`};return{name:"ScatterND",shaderCache:{hint:`${e.cacheKey}_${e.reduction}`,inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:o,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(s/64)},programUniforms:c}),getShaderSource:p}},fc=t=>ee({reduction:t.reduction}),hc=(t,e)=>{t.compute(db(t.inputs,e),{inputs:[t.inputs[1],t.inputs[2]],outputs:[]})}});var lb,cb,pb,bc,mb,fb,hb,gb,bb,yb,wb,_b,yc,vb,$b,xb,Sb,Tb,wc,_c,vc=V(()=>{"use strict";J();ne();Ie();ae();lb=(t,e)=>{if(t.every(r=>r>0||(()=>{throw new Error("Resize requires scales input values to be positive")})),t.length>0){if(e.mode==="linear"){if(!(t.length===2||t.length===3||t.length===4&&t[0]===1&&t[1]===1||t.length===4&&t[0]===1&&t[3]===1||t.length===5&&t[0]===1&&t[1]===1))throw new Error(`For linear mode, Resize requires scales to be 2D, 3D, 4D with either two outermost or one innermost and
            one outermost scale values equal to 1, or 5D with two outermost scale values equal to 1`)}else if(e.mode==="cubic"&&!(t.length===2||t.length===4&&t[0]===1&&t[1]===1||t.length===4&&t[0]===1&&t[3]===1))throw new Error("Resize requires scales input size to be 2 or 4 for cubic mode")}},cb=(t,e,r)=>{e.every(o=>o>=0&&o<r||(()=>{throw new Error("Resize requires axes input values to be positive and less than rank")}));let n=new Array(r).fill(1);return e.forEach((o,i)=>n[o]=t[i]),n},pb=(t,e,r,n,o,i)=>{let[s,u,d]=r>10?[1,2,3]:[-1,t.length>1?1:-1,-1],c=t[0].dims.length;if(s>0&&t.length>s&&t[s].dims.length>0)t[s].getFloat32Array().forEach(p=>i.push(p));else if(e.coordinateTransformMode==="tf_crop_and_resize")throw new Error("Resize requires RoI input to be specified when coordinateTransformMode is tfCropAndResize");if(u>0&&t.length>u&&t[u].dims.length===1&&t[u].dims[0]>0){if(t[u].getFloat32Array().forEach(p=>n.push(p)),n.length!==0&&n.length!==c&&r>=18&&n.length!==e.axes.length)throw new Error("Resize requires scales input size to be same as input rank or axes size for opset 18 and up");lb(n,e),e.axes.length>0&&cb(n,e.axes,c).forEach((p,m)=>n[m]=p)}if(d>0&&t.length>d&&t[d].dims.length===1&&t[d].dims[0]>0&&(t[d].getBigInt64Array().forEach(p=>o.push(Number(p))),o.length!==0&&o.length!==c&&r>=18&&o.length!==e.axes.length))throw new Error("Resize requires sizes input size to be same as input rank or axes size for opset 18 and up");if(e.axes.length>0){if(n.length!==0&&n.length!==e.axes.length)throw new Error('Resize requires "scales" input size to be of axes rank when axes attributes is specified');if(o.length!==0&&o.length!==e.axes.length)throw new Error('Resize requires "sizes" input size to be of rank axes rank when axes attributes is specified')}if(typeof n<"u"&&typeof o<"u"&&n.length>0&&o.length>c)throw new Error("Resize requires only of scales or sizes to be specified")},bc=(t,e,r,n)=>`
  // The whole part and the fractional part are calculated separately due to inaccuracy of floating
  // point division. As an example, f32(21) / f32(7) may evaluate to 2.99... instead of 3, causing an
  // offset-by-one error later in floor().
  let big = (${t}) * (${e});
  let whole = ${n}(big / (${r}));
  let fract = ${n}(big % (${r})) / ${n}(${r});
  return whole + fract;
`,mb=(t,e)=>`fn getOriginalCoordinateFromResizedCoordinate(xResized: u32, xScale: f32, lengthResized: u32,
     lengthOriginal: u32, roiStart: f32, roiEnd: f32) -> ${e} { `+(()=>{switch(t){case"asymmetric":return`
          if (xScale < 1.0 || floor(xScale) != xScale) {
            return ${e}(xResized) / ${e}(xScale);
          } else {
            ${bc("xResized","lengthOriginal","lengthResized",e)}
          }
        `;case"pytorch_half_pixel":return`if (lengthResized > 1) {
                    return (${e}(xResized) + 0.5) / ${e}(xScale) - 0.5;
                  } else {
                    return 0.0;
                  }`;case"tf_half_pixel_for_nn":return`return (${e}(xResized) + 0.5) / ${e}(xScale);`;case"align_corners":return`if (lengthResized == 1) {
                    return 0.0;
                  } else {
                    ${bc("xResized","lengthOriginal - 1","lengthResized - 1",e)}
                  }`;case"tf_crop_and_resize":return`if (lengthResized > 1) {
                    return ${e}(roiStart) * ${e}(lengthOriginal - 1) +
                        (${e}(xResized) * ${e}(roiEnd - roiStart) * ${e}(lengthOriginal - 1)) /
                        ${e}(lengthResized - 1);
                  } else {
                    return 0.5 * ${e}(roiStart + roiEnd) * ${e}(lengthOriginal - 1);
                  }`;case"half_pixel_symmetric":return`const outputWidth = ${e}xScale * ${e}(lengthResized);
                  const adjustment = ${e}(lengthResized) / outputWidth;
                  const center = ${e}(lengthOriginal) / 2;
                  const offset = center * (1 - adjustment);
                  return offset + ((${e}(xResized) + 0.5) / ${e}(xScale)) - 0.5;`;case"half_pixel":return`return ((${e}(xResized) + 0.5) / ${e}(xScale)) - 0.5;`;default:throw new Error(`Coordinate transform mode ${t} is not supported`)}})()+"}",fb=(t,e,r)=>`fn getNearestPixelFromOriginal(xOriginal: ${r}, isDownSample: bool) -> ${r} {`+(()=>{switch(t){case"round_prefer_ceil":return"if (fract(xOriginal) == 0.5) {             return ceil(xOriginal);           } else {             return round(xOriginal);           }";case"floor":return"return floor(xOriginal);";case"ceil":return"return ceil(xOriginal);";case"round_prefer_floor":return"if (fract(xOriginal) == 0.5) {                     return floor(xOriginal);                   } else {                     return round(xOriginal);                   }";case"simple":default:if(e<11)return"if (isDownSample)                     {                       return ceil(xOriginal);                     } else {                       return xOriginal;                     }";throw new Error(`Nearest mode ${t} is not supported`)}})()+"}",hb=(t,e,r)=>{let n=new Array(r).fill(0).concat(new Array(r).fill(1)),o=t.length===0?n:t.slice();return e.length>0?(e.forEach((i,s)=>{n[i]=o[s],n[s+r]=o[e.length+s]}),n):o},gb=(t,e,r,n)=>{let o=[];if(r.length>0)if(n.length>0){if(t.forEach(i=>o.push(i)),Math.max(...n)>t.length)throw new Error("axes is out of bound");n.forEach((i,s)=>o[i]=r[s])}else r.forEach(i=>o.push(i));else{if(e.length===0)throw new Error("Resize requires either scales or sizes.");o=t.map((i,s)=>Math.round(i*e[s]))}return o},bb=(t,e,r)=>{let n=(()=>{switch(r.keepAspectRatioPolicy){case"not_larger":return r.axes.length>0?Math.min(...r.axes.map(i=>e[i]),Number.MAX_VALUE):Math.min(...e,Number.MAX_VALUE);case"not_smaller":return r.axes.length>0?Math.max(...r.axes.map(i=>e[i]),Number.MIN_VALUE):Math.max(...e,Number.MIN_VALUE);default:throw new Error(`Keep aspect ratio policy ${r.keepAspectRatioPolicy} is not supported`)}})();e.fill(1,0,e.length);let o=t.slice();return r.axes.length>0?(r.axes.forEach(i=>e[i]=n),r.axes.forEach(i=>o[i]=Math.round(t[i]*e[i]))):(e.fill(n,0,e.length),o.forEach((i,s)=>o[s]=Math.round(i*e[s]))),o},yb=(t,e,r,n,o)=>`
    fn calculateOriginalIndicesFromOutputIndices(output_indices: ${t.type.indices}) -> array<${t.type.value}, ${r.length}> {
      var original_indices: array<${t.type.value}, ${r.length}>;
      for (var i:u32 = 0; i < ${r.length}; i++) {
        var output_index = ${t.indicesGet("output_indices","i")};
        var scale = ${F("uniforms.scales","i",n)};
        var roi_low = ${F("uniforms.roi","i",o)};
        var roi_hi = ${F("uniforms.roi",`i + ${e.length}`,o)};
        if (scale == 1.0) {
          original_indices[i] = ${t.type.value}(output_index);
        } else {
          var input_shape_i = ${F("uniforms.input_shape","i",e.length)};
          var output_shape_i = ${F("uniforms.output_shape","i",r.length)};
          original_indices[i] = getOriginalCoordinateFromResizedCoordinate(output_index, scale, output_shape_i,
                                                                           input_shape_i, roi_low, roi_hi);
        }
      }
      return original_indices;
    }`,wb=(t,e,r,n,o,i,s)=>`
    fn calculateInputIndicesFromOutputIndices(output_indices: ${e.type.indices}) -> ${t.type.indices} {
      var input_indices: ${t.type.indices};
      for (var i:u32 = 0; i < ${n.length}; i++) {
        var output_index = ${e.indicesGet("output_indices","i")};
        var input_index: u32;
        var scale = ${F("uniforms.scales","i",o)};
        if (scale == 1.0) {
          input_index = output_index;
        } else {
          var roi_low = ${F("uniforms.roi","i",i)};
          var roi_hi = ${F("uniforms.roi",`i + ${r.length}`,i)};
          var input_shape_i = ${F("uniforms.input_shape","i",r.length)};
          var output_shape_i = ${F("uniforms.output_shape","i",n.length)};
          var original_idx = getOriginalCoordinateFromResizedCoordinate(output_index, scale, output_shape_i,
                                                                        input_shape_i, roi_low, roi_hi);
          if (!${s} || (original_idx >= 0 && original_idx < ${e.type.value}(input_shape_i))) {
            if (original_idx < 0) {
              input_index = 0;
            } else if (original_idx > ${e.type.value}(input_shape_i - 1)) {
              input_index = input_shape_i - 1;
            } else {
              input_index = u32(getNearestPixelFromOriginal(original_idx, scale < 1));
            }
          } else {
            input_index = u32(original_idx);
          }
        }
        ${t.indicesSet("input_indices","i","input_index")}
      }
      return input_indices;
    }`,_b=(t,e)=>`
    fn checkInputIndices(input_indices: ${t.type.indices}) -> bool {
      for (var i:u32 = 0; i < ${e.length}; i++) {
        var input_index = ${t.indicesGet("input_indices","i")};
        if (input_index < 0 || input_index >= ${F("uniforms.input_shape","i",e.length)}) {
          return false;
        }
      }
      return true;
    }`,yc=(t,e,r,n)=>t.rank>n?`
    ${t.indicesSet("input_indices",e,"channel")};
    ${t.indicesSet("input_indices",r,"batch")};
`:"",vb=(t,e,r,n,o)=>{let[s,u,d,c]=r.length===2?[-1,0,1,-1]:[0,2,3,1],p=t.type.value;return`
    fn getInputValue(batch: u32, channel: u32, row: u32, col: u32) -> ${p} {
      var input_indices: ${t.type.indices};
      ${t.indicesSet("input_indices",u,`max(0, min(row, ${r[u]} - 1))`)};
      ${t.indicesSet("input_indices",d,`max(0, min(col, ${r[d]} - 1))`)};
      ${yc(t,c,s,2)}
      return ${t.getByIndices("input_indices")};
    }

    fn bilinearInterpolation(output_indices: ${e.type.indices}) -> ${p} {
      var originalIndices = calculateOriginalIndicesFromOutputIndices(output_indices);
      var row:${p} = originalIndices[${u}];
      var col:${p} = originalIndices[${d}];
      ${n?`if (row < 0 || row > (${r[u]} - 1) || col < 0 || col > (${r[d]} - 1)) {
        return ${o};
      }`:""};
      row = max(0, min(row, ${r[u]} - 1));
      col = max(0, min(col, ${r[d]} - 1));
      var row1: u32 = u32(row);
      var col1: u32 = u32(col);
      var row2: u32 = u32(row + 1);
      var col2: u32 = u32(col + 1);
      var channel: u32 = ${r.length>2?`u32(originalIndices[${c}])`:"0"};
      var batch: u32 =  ${r.length>2?`u32(originalIndices[${s}])`:"0"};
      var x11: ${p} = getInputValue(batch, channel, row1, col1);
      var x12: ${p} = getInputValue(batch, channel, row1, col2);
      var x21: ${p} = getInputValue(batch, channel, row2, col1);
      var x22: ${p} = getInputValue(batch, channel, row2, col2);
      var dx1: ${p} = abs(row - ${p}(row1));
      var dx2: ${p} = abs(${p}(row2) - row);
      var dy1: ${p} = abs(col - ${p}(col1));
      var dy2: ${p} = abs(${p}(col2) - col);
      if (row1 == row2) {
        dx1 = 0.5;
        dx2 = 0.5;
      }
      if (col1 == col2) {
        dy1 = 0.5;
        dy2 = 0.5;
      }
      return (x11 * dx2 * dy2 + x12 * dx2 * dy1 + x21 * dx1 * dy2 + x22 * dx1 * dy1);
    }`},$b=(t,e,r,n,o,i,s,u,d,c)=>{let p=r.length===2,m=!0,[g,y]=p?[0,1]:m?[2,3]:[1,2],b=t.type.value,w=S=>{let x=S===g?"row":"col";return`
      fn ${x}CubicInterpolation(input_indices: ${t.type.indices}, output_indices: ${e.type.indices}) -> ${b} {
        var output_index = ${e.indicesGet("output_indices",S)};
        var originalIdx: ${b} = getOriginalCoordinateFromResizedCoordinate(output_index, ${o[S]},
        ${n[S]}, ${r[S]}, ${i[S]}, ${i[S]} + ${r.length});
        var fractOriginalIdx: ${b} = originalIdx - floor(originalIdx);
        var coefs = getCubicInterpolationCoefs(fractOriginalIdx);

        if (${u} && (originalIdx < 0 || originalIdx > (${r[S]} - 1))) {
          return ${d};
        }
        var data: array<${b}, 4> = array<${b}, 4>(0.0, 0.0, 0.0, 0.0);
        for (var i: i32 = -1; i < 3; i++) {
          var ${x}: ${b} = originalIdx + ${b}(i);
          if (${x} < 0 || ${x} >= ${r[S]}) {
            ${c?`coefs[i + 1] = 0.0;
                        continue;`:u?`return ${d};`:`${x} = max(0, min(${x}, ${r[S]} - 1));`};
          }
        var input_indices_copy: ${t.type.indices} = input_indices;
          ${t.indicesSet("input_indices_copy",S,`u32(${x})`)};
          data[i + 1] = ${S===g?t.getByIndices("input_indices_copy"):"rowCubicInterpolation(input_indices_copy, output_indices)"};
        }
        return cubicInterpolation1D(data, coefs);
      }`};return`
    ${w(g)};
    ${w(y)};
  fn getCubicInterpolationCoefs(s: ${b}) -> array<${b}, 4> {
    var absS = abs(s);
    var coeffs: array<${b}, 4> = array<${b}, 4>(0.0, 0.0, 0.0, 0.0);
    var oneMinusAbsS: ${b} = 1.0 - absS;
    var twoMinusAbsS: ${b} = 2.0 - absS;
    var onePlusAbsS: ${b} = 1.0 + absS;
    coeffs[0] = ((${s} * onePlusAbsS - 5 * ${s}) * onePlusAbsS + 8 * ${s}) * onePlusAbsS - 4 * ${s};
    coeffs[1] = ((${s} + 2) * absS - (${s} + 3)) * absS * absS + 1;
    coeffs[2] = ((${s} + 2) * oneMinusAbsS - (${s} + 3)) * oneMinusAbsS * oneMinusAbsS + 1;
    coeffs[3] = ((${s} * twoMinusAbsS - 5 * ${s}) * twoMinusAbsS + 8 * ${s}) * twoMinusAbsS - 4 * ${s};
    return coeffs;
  }

  fn cubicInterpolation1D(x: array<${b}, 4>, coefs: array<${b}, 4>) -> ${b} {
    var coefsSum: ${b} = coefs[0] + coefs[1] + coefs[2] + coefs[3];
    return (x[0] * coefs[0] + x[1] * coefs[1]+ x[2] * coefs[2]+ x[3] * coefs[3]) / coefsSum;
  }

  fn bicubicInterpolation(output_indices: ${e.type.indices}) -> ${b} {
    var input_indices: ${t.type.indices} = output_indices;
    return colCubicInterpolation(input_indices, output_indices);
  }
    `},xb=(t,e,r,n,o)=>{let[s,u,d,c,p]=r.length===3?[-1,0,1,2,-1]:[0,2,3,4,1],m=t.type.value;return`
    fn getInputValue(batch: u32, channel: u32, depth:u32, height: u32, width: u32) -> ${m} {
      var input_indices: ${t.type.indices};
      ${t.indicesSet("input_indices",u,`max(0, min(depth, ${r[u]} - 1))`)};
      ${t.indicesSet("input_indices",d,`max(0, min(height, ${r[d]} - 1))`)};
      ${t.indicesSet("input_indices",c,`max(0, min(width, ${r[c]} - 1))`)};
      ${yc(t,p,s,3)}
      return ${t.getByIndices("input_indices")};
    }

    fn trilinearInterpolation(output_indices: ${e.type.indices}) -> ${m} {
      var originalIndices = calculateOriginalIndicesFromOutputIndices(output_indices);
      var depth:${m} = originalIndices[${u}];
      var height:${m} = originalIndices[${d}];
      var width:${m} = originalIndices[${c}];
      ${n?`if (depth < 0 || depth > (${r[u]} - 1) || height < 0 || height > (${r[d]} - 1) || width < 0 || (width > ${r[c]} - 1)) {
      return ${o};
        }`:""};

    depth = max(0, min(depth, ${r[u]} - 1));
      height = max(0, min(height, ${r[d]} - 1));
      width = max(0, min(width, ${r[c]} - 1));
      var depth1: u32 = u32(depth);
      var height1: u32 = u32(height);
      var width1: u32 = u32(width);
      var depth2: u32 = u32(depth + 1);
      var height2: u32 = u32(height + 1);
      var width2: u32 = u32(width + 1);
      var channel: u32 = ${r.length>3?`u32(originalIndices[${p}])`:"0"};
      var batch: u32 =  ${r.length>3?`u32(originalIndices[${s}])`:"0"};

      var x111: ${m} = getInputValue(batch, channel, depth1, height1, width1);
      var x112: ${m} = getInputValue(batch, channel, depth1, height1, width2);
      var x121: ${m} = getInputValue(batch, channel, depth1, height2, width1);
      var x122: ${m} = getInputValue(batch, channel, depth1, height2, width2);
      var x211: ${m} = getInputValue(batch, channel, depth2, height1, width1);
      var x212: ${m} = getInputValue(batch, channel, depth2, height1, width2);
      var x221: ${m} = getInputValue(batch, channel, depth2, height2, width1);
      var x222: ${m} = getInputValue(batch, channel, depth2, height2, width2);
      var dx1: ${m} = abs(depth - ${m}(depth1));
      var dx2: ${m} = abs(${m}(depth2) - depth);
      var dy1: ${m} = abs(height - ${m}(height1));
      var dy2: ${m} = abs(${m}(height2) - height);
      var dz1: ${m} = abs(width - ${m}(width1));
      var dz2: ${m} = abs(${m}(width2) - width);
      if (depth1 == depth2) {
        dx1 = 0.5;
        dx2 = 0.5;
      }
      if (height1 == height2) {
        dy1 = 0.5;
        dy2 = 0.5;
      }
      if (width1 == width2) {
        dz1 = 0.5;
        dz2 = 0.5;
      }
      return (x111 * dx2 * dy2 * dz2 + x112 * dx2 * dy2 * dz1 + x121 * dx2 * dy1 *dz2 + x122 * dx2 * dy1 * dz1 +
              x211 * dx1 * dy2 * dz2 + x212 * dx1 * dy2 * dz1 + x221 * dx1 * dy1 *dz2 + x222 * dx1 * dy1 * dz1);
    }`},Sb=(t,e,r,n,o,i)=>{let s=t.dims,u=hb(i,e.axes,s.length),d=gb(s,n,o,e.axes),c=n.slice();n.length===0&&(c=s.map(($,T)=>$===0?1:d[T]/$),e.keepAspectRatioPolicy!=="stretch"&&(d=bb(s,c,e)));let p=R("output",t.dataType,d.length),m=O("input",t.dataType,s.length),g=k.size(d),y=s.length===d.length&&s.every(($,T)=>$===d[T]),b=e.coordinateTransformMode==="tf_crop_and_resize",w=e.extrapolationValue,S=m.type.value,x=$=>`
      ${y?"":`
      ${mb(e.coordinateTransformMode,S)};
      ${(()=>{switch(e.mode){case"nearest":return`
              ${_b(m,s)};
              ${fb(e.nearestMode,r,S)};
              ${wb(m,p,s,d,c.length,u.length,b)};
              `;case"linear":return`
              ${yb(p,s,d,c.length,u.length)};
              ${(()=>{if(s.length===2||s.length===4)return`${vb(m,p,s,b,w)}`;if(s.length===3||s.length===5)return`${xb(m,p,s,b,w)}`;throw Error("Linear mode only supports input dims 2, 3, 4 and 5 are supported in linear mode.")})()};
            `;case"cubic":return`
            ${(()=>{if(s.length===2||s.length===4)return`${$b(m,p,s,d,c,u,e.cubicCoeffA,b,e.extrapolationValue,e.excludeOutside)}`;throw Error("Cubic mode only supports input dims 2 and 4 are supported in linear mode.")})()};
            `;default:throw Error("Invalid resize mode")}})()};
      `}
      ${$.registerUniform("output_size","u32").registerUniform("scales","f32",c.length).registerUniform("roi","f32",u.length).declareVariables(m,p)}
      ${$.mainStart()}
        ${$.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
        ${y?"output[global_idx] = input[global_idx];":`
        let output_indices = ${p.offsetToIndices("global_idx")};
        var input_indices: ${m.type.indices};
        ${(()=>{switch(e.mode){case"nearest":return`input_indices = calculateInputIndicesFromOutputIndices(output_indices);
                if (checkInputIndices(input_indices)) {
                  output[global_idx] = ${m.getByIndices("input_indices")};
                } else {
                  output[global_idx] = ${e.extrapolationValue};
                }`;case"linear":return`output[global_idx] = ${s.length===2||s.length===4?"bilinearInterpolation":"trilinearInterpolation"}(output_indices);`;case"cubic":return"output[global_idx] = bicubicInterpolation(output_indices);";default:throw Error(`Unsupported resize mode: ${e.mode}`)}})()};
`}
      }`;return{name:"Resize",shaderCache:{hint:`${e.cacheKey}|${r}|${c.length>0?e.mode==="cubic"?c:c.length:""}|${o.length>0?o:""}|${u.length>0?u:""}|${y}|${e.mode==="nearest"?s.length:s}`,inputDependencies:["rank"]},getShaderSource:x,getRunData:()=>({outputs:[{dims:d,dataType:t.dataType}],dispatchGroup:{x:Math.ceil(g/64)},programUniforms:[{type:12,data:g},{type:1,data:c},{type:1,data:u},...L(s,d)]})}},Tb=t=>{let e=t.customDataBuffer;return new Uint32Array(e,e.byteOffset,1)[0]},wc=(t,e)=>{let r=[],n=[],o=[],i=Tb(t);if(e.antialias!==0)throw Error("Only default value (0) for Antialias attribute is supported");pb(t.inputs,e,i,r,n,o),t.compute(Sb(t.inputs[0],e,i,r,n,o),{inputs:[0]})},_c=t=>{let e=t.antialias,r=t.axes,n=t.coordinateTransformMode,o=t.cubicCoeffA,i=t.excludeOutside!==0,s=t.extrapolationValue,u=t.keepAspectRatioPolicy,d=t.mode,c=t.nearestMode===""?"simple":t.nearestMode;return ee({antialias:e,axes:r,coordinateTransformMode:n,cubicCoeffA:o,excludeOutside:i,extrapolationValue:s,keepAspectRatioPolicy:u,mode:d,nearestMode:c})}});var Ib,Cb,$c,xc=V(()=>{"use strict";J();ne();ae();Ib=t=>{if(!t||t.length<3)throw new Error("layerNorm requires at least 3 inputs.");let e=t[0],r=t[1],n=t[2];if(e.dataType!==r.dataType||e.dataType!==n.dataType)throw new Error("All inputs must have the same data type");if(e.dims.length!==3&&e.dims.length!==2)throw new Error("Input must be 2D or 3D");if(r.dims.length!==3&&r.dims.length!==2)throw new Error("Skip must be 2D or 3D");let o=e.dims[e.dims.length-1],i=e.dims[e.dims.length-2];if(r.dims[r.dims.length-1]!==o)throw new Error("Skip must have the same hidden size as input");if(r.dims[r.dims.length-2]!==i)throw new Error("Skip must have the same sequence length as input");if(n.dims.length!==1)throw new Error("Gamma must be 1D");if(n.dims[n.dims.length-1]!==o)throw new Error("Gamma must have the same hidden size as input");if(t.length>3){let s=t[3];if(s.dims.length!==1)throw new Error("Beta must be 1D");if(s.dims[s.dims.length-1]!==o)throw new Error("Beta must have the same hidden size as input")}if(t.length>4){let s=t[4];if(s.dims.length!==1)throw new Error("Bias must be 1D");if(s.dims[s.dims.length-1]!==o)throw new Error("Bias must have the same hidden size as input")}},Cb=(t,e,r,n)=>{let o=e.simplified,i=t[0].dims,s=k.size(i),u=i,d=s,c=i.slice(-1)[0],p=n?i.slice(0,-1).concat(1):[],m=!o&&t.length>3,g=t.length>4,y=n&&r>1,b=n&&r>2,w=r>3,S=64,x=fe(c),$=[{type:12,data:d},{type:12,data:x},{type:12,data:c},{type:1,data:e.epsilon}],T=E=>{let A=[{name:"output_size",type:"u32"},{name:"components",type:"u32"},{name:"hidden_size",type:"u32"},{name:"epsilon",type:"f32"}],z=[O("x",t[0].dataType,t[0].dims,x),O("skip",t[1].dataType,t[1].dims,x),O("gamma",t[2].dataType,t[2].dims,x)];m&&z.push(O("beta",t[3].dataType,t[3].dims,x)),g&&z.push(O("bias",t[4].dataType,t[4].dims,x)),z.push(R("output",t[0].dataType,u,x)),y&&z.push(R("mean_output",1,p)),b&&z.push(R("inv_std_output",1,p)),w&&z.push(R("input_skip_bias_sum",t[0].dataType,u,x));let v=ye(t[0].dataType),M=ye(1,x);return`

      ${E.registerUniforms(A).declareVariables(...z)}
      var<workgroup> sum_shared : array<${M}, ${S}>;
      var<workgroup> sum_squared_shared : array<${M}, ${S}>;

      ${E.mainStart([S,1,1])}
        let ix = local_id.x;
        let iy = global_id.x / ${S};

        let hidden_size_vectorized: u32 = uniforms.hidden_size / uniforms.components;
        var stride = hidden_size_vectorized / ${S};
        let offset = ix * stride + iy * hidden_size_vectorized;
        let offset1d = stride * ix;
        if (ix == ${S-1}) {
          stride = hidden_size_vectorized - stride * ix;
        }
        for (var i: u32 = 0; i < stride; i++) {
          let skip_value = skip[offset + i];
          let bias_value = ${g?"bias[offset1d + i]":v+"(0.0)"};
          let input_value = x[offset + i];
          let value = input_value + skip_value + bias_value;
          ${w?"input_skip_bias_sum[offset + i] = value;":""}
          output[offset + i] = value;
          let f32_value = ${Bt(v,x,"value")};
          sum_shared[ix] += f32_value;
          sum_squared_shared[ix] += f32_value * f32_value;
        }
        workgroupBarrier();

        var reduce_size : u32 = ${S};
        for (var curr_size = reduce_size >> 1;  curr_size > 0; curr_size = reduce_size >> 1) {
          reduce_size = curr_size + (reduce_size & 1);
          if (ix < curr_size) {
            sum_shared[ix] += sum_shared[ix + reduce_size];
            sum_squared_shared[ix] += sum_squared_shared[ix + reduce_size];
          }
          workgroupBarrier();
        }

        let sum = sum_shared[0];
        let square_sum = sum_squared_shared[0];
        let mean = ${je("sum",x)} / f32(uniforms.hidden_size);
        let inv_std_dev = inverseSqrt(${je("square_sum",x)} / f32(uniforms.hidden_size) ${o?"":"- mean * mean"} + uniforms.epsilon);
        ${y?"mean_output[global_idx] = mean;":""}
        ${b?"inv_std_output[global_idx] = inv_std_dev;":""}

        for (var i: u32 = 0; i < stride; i++) {
          output[offset + i] = (output[offset + i] ${o?"":`- ${v}(mean)`}) *
            ${v}(inv_std_dev) * gamma[offset1d + i]
            ${m?"+ beta[offset1d + i]":""};
        }
      }`},I=[{dims:u,dataType:t[0].dataType}];return r>1&&I.push({dims:p,dataType:1}),r>2&&I.push({dims:p,dataType:1}),r>3&&I.push({dims:i,dataType:t[0].dataType}),{name:"SkipLayerNormalization",shaderCache:{hint:`${x};${y};${b};${w}`,inputDependencies:t.map((E,A)=>"type")},getShaderSource:T,getRunData:()=>({outputs:I,dispatchGroup:{x:Math.ceil(d/c)},programUniforms:$})}},$c=(t,e)=>{Ib(t.inputs);let n=[0];t.outputCount>1&&n.push(-3),t.outputCount>2&&n.push(-3),t.outputCount>3&&n.push(3),t.compute(Cb(t.inputs,e,t.outputCount,!1),{outputs:n})}});var Ab,mn,Eb,Sc,kb,Pb,Tc,Ic,Cc=V(()=>{"use strict";J();ne();Ie();ae();Ab=(t,e)=>{if(!t||t.length<1)throw new Error("too few inputs");if(e.axes.length!==0){if(e.axes.length!==e.starts.length||e.axes.length!==e.ends.length)throw new Error("axes, starts and ends must have the same length")}else if(e.starts.length!==e.ends.length)throw new Error("starts and ends must have the same length");t.slice(1).forEach((r,n)=>{if(t[n+1].dataType!==6&&t[n+1].dataType!==7)throw new Error(`Input ${n} must be an array of int32 or int64`)})},mn=(t,e)=>{let r=[];if(t.length>e)if(t[e].dataType===7)t[e].getBigInt64Array().forEach(n=>r.push(Number(n)));else if(t[e].dataType===6)t[e].getInt32Array().forEach(n=>r.push(Number(n)));else throw new Error(`Input ${e} must be an array of int32 or int64`);return r},Eb=(t,e)=>{if(t.length>1){let r=mn(t,1),n=mn(t,2),o=mn(t,3);return o.length===0&&(o=[...Array(t[0].dims.length).keys()]),ee({starts:r,ends:n,axes:o})}else return e},Sc=(t,e,r,n,o)=>{let i=t;return t<0&&(i+=r[n[e]]),o[e]<0?Math.max(0,Math.min(i,r[n[e]]-1)):Math.max(0,Math.min(i,r[n[e]]))},kb=(t,e,r)=>`fn calculateInputIndices(output_indices: ${e.type.indices}) -> ${t.type.indices} {
          var input_indices: ${t.type.indices};
          var carry = 0u;
          for (var i = ${r.length-1}; i >= 0; i--) {
            let input_shape_i = ${F("uniforms.input_shape","i",r.length)};
            let steps_i = ${F("uniforms.steps","i",r.length)};
            let signs_i = ${F("uniforms.signs","i",r.length)};
            let starts_i = ${F("uniforms.starts","i",r.length)};
            var output_index = ${e.indicesGet("output_indices","i")};
            var input_index = output_index * steps_i + starts_i + carry;
            carry = input_index / input_shape_i;
            input_index = input_index % input_shape_i;
            if (signs_i < 0) {
              input_index = input_shape_i - input_index - 1u + starts_i;
            }
            ${t.indicesSet("input_indices","i","input_index")};
          }
          return input_indices;
      }`,Pb=(t,e)=>{let r=t[0].dims,n=k.size(r),o=e.axes.length>0?k.normalizeAxes(e.axes,r.length):[...Array(r.length).keys()],i=mn(t,4);i.forEach(x=>x!==0||(()=>{throw new Error("step cannot be 0")})),i.length===0&&(i=Array(o.length).fill(1));let s=e.starts.map((x,$)=>Sc(x,$,r,o,i)),u=e.ends.map((x,$)=>Sc(x,$,r,o,i));if(o.length!==s.length||o.length!==u.length)throw new Error("start, ends and axes should have the same number of elements");if(o.length!==r.length)for(let x=0;x<r.length;++x)o.includes(x)||(s.splice(x,0,0),u.splice(x,0,r[x]),i.splice(x,0,1));let d=i.map(x=>Math.sign(x));i.forEach((x,$,T)=>{if(x<0){let I=(u[$]-s[$])/x,E=s[$],A=E+I*i[$];s[$]=A,u[$]=E,T[$]=-x}});let c=r.slice(0);o.forEach((x,$)=>{c[x]=Math.ceil((u[x]-s[x])/i[x])});let p={dims:c,dataType:t[0].dataType},m=R("output",t[0].dataType,c.length),g=O("input",t[0].dataType,t[0].dims.length),y=k.size(c),b=[{name:"outputSize",type:"u32"},{name:"starts",type:"u32",length:s.length},{name:"signs",type:"i32",length:d.length},{name:"steps",type:"u32",length:i.length}],w=[{type:12,data:y},{type:12,data:s},{type:6,data:d},{type:12,data:i},...L(t[0].dims,c)],S=x=>`
      ${x.registerUniforms(b).declareVariables(g,m)}
        ${kb(g,m,r)}
        ${x.mainStart()}
          ${x.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
          let output_indices = ${m.offsetToIndices("global_idx")};
          let input_indices = calculateInputIndices(output_indices);
          ${m.setByOffset("global_idx",g.getByIndices("input_indices"))}
      }`;return{name:"Slice",shaderCache:{hint:`${d.length}_${s.length}_${i.length}`,inputDependencies:["rank"]},getShaderSource:S,getRunData:()=>({outputs:[p],dispatchGroup:{x:Math.ceil(n/64)},programUniforms:w})}},Tc=(t,e)=>{Ab(t.inputs,e);let r=Eb(t.inputs,e);t.compute(Pb(t.inputs,r),{inputs:[0]})},Ic=t=>{let e=t.starts,r=t.ends,n=t.axes;return ee({starts:e,ends:r,axes:n})}});var Ob,zb,Ac,Ec,kc=V(()=>{"use strict";J();ne();Ie();pt();ae();Ob=t=>{if(!t||t.length!==1)throw new Error("Softmax op requires 1 input.")},zb=(t,e)=>{let r=t.inputs[0],n=r.dims,o=k.size(n),i=n.length,s=k.normalizeAxis(e.axis,i),u=s<n.length-1,d,c=[];u?(c=Array.from({length:i},(z,v)=>v),c[s]=i-1,c[i-1]=s,d=t.compute(Oe(r,c),{inputs:[r],outputs:[-1]})[0]):d=r;let p=d.dims,m=p[i-1],g=o/m,y=fe(m),b=m/y,w=64;g===1&&(w=256);let S=(z,v)=>v===4?`max(max(${z}.x, ${z}.y), max(${z}.z, ${z}.w))`:v===2?`max(${z}.x, ${z}.y)`:v===3?`max(max(${z}.x, ${z}.y), ${z}.z)`:z,x=O("x",d.dataType,d.dims,y),$=R("result",d.dataType,d.dims,y),T=x.type.value,I=ye(d.dataType)==="f32"?`var threadMax = ${T}(-3.4028234663852886e+38f);`:`var threadMax = ${T}(-65504.0h);`,E=z=>`
      var<workgroup> rowMaxShared : ${T};
      var<workgroup> rowSumShared : ${T};
      var<workgroup> threadShared : array<${T}, ${w}>;

      fn getValue(row: i32, col: i32, row_stride: i32) -> ${T} {
        let index = row * row_stride + col;
        return x[index];
      }

      fn setValue(row: i32, col: i32, row_stride: i32, value: ${T}) {
        let index = row * row_stride + col;
        result[index] = value;
      }
      ${z.registerUniform("packedCols","i32").declareVariables(x,$)}
      ${z.mainStart(w)}
        let gindex = i32(global_idx);
        let lindex = i32(local_idx);
        const wg = ${w};
        let row = gindex / wg;
        let cols = uniforms.packedCols;
        let row_stride : i32 = uniforms.packedCols;

        // find the rows max
        ${I}
        for (var col = lindex; col < cols; col += wg) {
          let value = getValue(row, col, row_stride);
          threadMax = max(threadMax, value);
        }
        if (lindex < cols) {
          threadShared[lindex] = threadMax;
        }
        workgroupBarrier();

        var reduceSize = min(cols, wg);
        for (var currSize = reduceSize >> 1;  currSize > 0; currSize = reduceSize >> 1) {
          reduceSize = currSize + (reduceSize & 1);
          if (lindex < currSize) {
            threadShared[lindex] = max(threadShared[lindex], threadShared[lindex + reduceSize]);
          }
          workgroupBarrier();
        }
        if (lindex == 0) {
          rowMaxShared = ${T}(${S("threadShared[0]",y)});
        }
        workgroupBarrier();

        // find the rows sum
        var threadSum = ${T}(0.0);
        for (var col = lindex; col < cols; col += wg) {
          let subExp = exp(getValue(row, col, row_stride) - rowMaxShared);
          threadSum += subExp;
        }
        threadShared[lindex] = threadSum;
        workgroupBarrier();

        for (var currSize = wg >> 1;  currSize > 0; currSize = currSize >> 1) {
          if (lindex < currSize) {
            threadShared[lindex] = threadShared[lindex] + threadShared[lindex + currSize];
          }
          workgroupBarrier();
        }
        if (lindex == 0) {
          rowSumShared = ${T}(${je("threadShared[0]",y)});
        }
        workgroupBarrier();

        // calculate final value for each element in the row
        for (var col = lindex; col < cols; col += wg) {
          var value = exp(getValue(row, col, row_stride) - rowMaxShared) / rowSumShared;
          // max operation protects against NaN since all values should be >=0
          value = max(value, ${T}(0.0));
          setValue(row, col, row_stride, value);
        }
      }`,A=t.compute({name:"Softmax",shaderCache:{hint:`${y};${w}`,inputDependencies:["type"]},getRunData:()=>({outputs:[{dims:p,dataType:d.dataType}],dispatchGroup:{x:g},programUniforms:[{type:6,data:b}]}),getShaderSource:E},{inputs:[d],outputs:[u?-1:0]})[0];u&&t.compute(Oe(A,c),{inputs:[A]})},Ac=(t,e)=>{Ob(t.inputs),zb(t,e)},Ec=t=>ee({axis:t.axis})});var Pc,Db,Bb,Mb,Oc,zc=V(()=>{"use strict";J();ne();ae();Pc=t=>Array.from(t.getBigInt64Array(),Number),Db=t=>{if(!t||t.length!==2)throw new Error("Tile requires 2 inputs.");if(t[0].dataType!==1&&t[0].dataType!==10&&t[0].dataType!==6&&t[0].dataType!==12)throw new Error("Tile only support float, float16, int32, and uint32 data types");if(t[1].dataType!==7)throw new Error("Tile `repeats` input should be of int64 data type");if(t[1].dims.length!==1)throw new Error("Tile `repeats` input should be 1-D");if(Pc(t[1]).length!==t[0].dims.length)throw new Error("Tile `repeats` input should have same number of elements as rank of input data tensor")},Bb=(t,e)=>{let r=[];for(let n=0;n<t.length;++n)r.push(t[n]*e[n]);return r},Mb=(t,e)=>{let r=t[0].dims,n=e??Pc(t[1]),o=Bb(r,n),i=k.size(o),s=t[0].dataType,u=O("input",s,r.length),d=R("output",s,o.length),c=p=>`
      const inputShape = ${u.indices(...r)};
      ${p.registerUniform("output_size","u32").declareVariables(u,d)}
      ${p.mainStart()}
      ${p.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
      let output_indices = ${d.offsetToIndices("global_idx")};
      var input_indices: ${u.type.indices};
      for (var i = 0; i < ${r.length}; i++) {
        let input_dim_i = ${u.indicesGet("uniforms.input_shape","i")};
        let input_dim_value = ${d.indicesGet("output_indices","i")}  % input_dim_i;

        ${u.indicesSet("input_indices","i","input_dim_value")}
      }
      ${d.setByOffset("global_idx",u.getByIndices("input_indices"))}
    }`;return{name:"Tile",shaderCache:{hint:`${n}`,inputDependencies:["rank"]},getRunData:()=>({outputs:[{dims:o,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(i/64)},programUniforms:[{type:12,data:i},...L(t[0].dims,o)]}),getShaderSource:c}},Oc=t=>{Db(t.inputs),t.compute(Mb(t.inputs),{inputs:[0]})}});var Rb,Ub,Dc,Bc=V(()=>{"use strict";J();ne();ae();Rb=(t,e,r,n,o)=>{let i=R("output_data",o,r.length,4),s=O("a_data",e[1].dataType,e[1].dims.length,4),u=O("b_data",e[2].dataType,e[2].dims.length,4),d=O("c_data",e[0].dataType,e[0].dims.length,4),c,p=(m,g,y)=>`select(${g}, ${m}, ${y})`;if(!n)c=i.setByOffset("global_idx",p(s.getByOffset("global_idx"),u.getByOffset("global_idx"),d.getByOffset("global_idx")));else{let m=(g,y,b="")=>{let w=`a_data[index_a${y}][component_a${y}]`,S=`b_data[index_b${y}][component_b${y}]`,x=`bool(c_data[index_c${y}] & (0xffu << (component_c${y} * 8)))`;return`
            let output_indices${y} = ${i.offsetToIndices(`global_idx * 4u + ${y}u`)};
            let offset_a${y} = ${s.broadcastedIndicesToOffset(`output_indices${y}`,i)};
            let offset_b${y} = ${u.broadcastedIndicesToOffset(`output_indices${y}`,i)};
            let offset_c${y} = ${d.broadcastedIndicesToOffset(`output_indices${y}`,i)};
            let index_a${y} = offset_a${y} / 4u;
            let index_b${y} = offset_b${y} / 4u;
            let index_c${y} = offset_c${y} / 4u;
            let component_a${y} = offset_a${y} % 4u;
            let component_b${y} = offset_b${y} % 4u;
            let component_c${y} = offset_c${y} % 4u;
            ${g}[${y}] = ${b}(${p(w,S,x)});
          `};o===9?c=`
            var data = vec4<u32>(0);
            ${m("data",0,"u32")}
            ${m("data",1,"u32")}
            ${m("data",2,"u32")}
            ${m("data",3,"u32")}
            output_data[global_idx] = dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(data));`:c=`
            ${m("output_data[global_idx]",0)}
            ${m("output_data[global_idx]",1)}
            ${m("output_data[global_idx]",2)}
            ${m("output_data[global_idx]",3)}
          `}return`
        ${t.registerUniform("vec_size","u32").declareVariables(d,s,u,i)}
        ${t.mainStart()}
        ${t.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
        ${c}
      }`},Ub=t=>{let e=t[1].dims,r=t[2].dims,n=t[0].dims,o=t[1].dataType,i=!(k.areEqual(e,r)&&k.areEqual(r,n)),s=e,u=k.size(e);if(i){let c=ot.calcShape(ot.calcShape(e,r,!1),n,!1);if(!c)throw new Error("Can't perform where op on the given tensors");s=c,u=k.size(s)}let d=Math.ceil(u/4);return{name:"Where",shaderCache:{inputDependencies:["rank","rank","rank"]},getShaderSource:c=>Rb(c,t,s,i,o),getRunData:()=>({outputs:[{dims:s,dataType:o}],dispatchGroup:{x:Math.ceil(u/64/4)},programUniforms:[{type:12,data:d},...L(n,e,r,s)]})}},Dc=t=>{t.compute(Ub(t.inputs))}});var Mc,Rc=V(()=>{"use strict";bu();en();_u();$u();sd();yd();vd();Rd();Hd();Kd();Qd();tl();ol();al();dl();pl();hl();yl();vl();Sl();zl();Ml();Ul();Vl();Gl();Eo();Fl();uc();cc();mc();gc();Xr();vc();Oo();xc();Cc();kc();Po();zc();pt();rn();Bc();Mc=new Map([["Abs",[xu]],["Acos",[Su]],["Acosh",[Tu]],["Add",[ud]],["ArgMax",[gu,go]],["ArgMin",[hu,go]],["Asin",[Iu]],["Asinh",[Cu]],["Atan",[Au]],["Atanh",[Eu]],["Attention",[yu]],["AveragePool",[Jl,Xl]],["BatchNormalization",[wu]],["BiasAdd",[vu]],["BiasSplitGelu",[ad]],["Cast",[Pu,ku]],["Ceil",[zu]],["Clip",[Ou]],["Concat",[wd,_d]],["Conv",[To,So]],["ConvTranspose",[Gd,Ld]],["Cos",[Du]],["Cosh",[Bu]],["CumSum",[Fd,qd]],["DepthToSpace",[jd,Zd]],["DequantizeLinear",[dc,lc]],["Div",[dd]],["Einsum",[Jd,el]],["Elu",[Mu,nr]],["Equal",[ld]],["Erf",[Ru]],["Exp",[Uu]],["Expand",[nl]],["FastGelu",[il]],["Floor",[Nu]],["FusedConv",[To,So]],["Gather",[ul,sl]],["GatherElements",[bl,gl]],["GatherBlockQuantized",[ml,fl]],["GatherND",[ll,cl]],["Gelu",[Vu]],["Gemm",[_l,wl]],["GlobalAveragePool",[rc,tc]],["GlobalMaxPool",[sc,ac]],["Greater",[fd]],["GreaterOrEqual",[gd]],["GridSample",[$l,xl]],["GroupQueryAttention",[Ol]],["HardSigmoid",[ju,Ku]],["InstanceNormalization",[Bl]],["LayerNormalization",[Rl]],["LeakyRelu",[Lu,nr]],["Less",[hd]],["LessOrEqual",[bd]],["Log",[nd]],["MatMul",[Nl]],["MatMulNBits",[Ll,Wl]],["MaxPool",[oc,ic]],["Mul",[cd]],["MultiHeadAttention",[Cl,Il]],["Neg",[Gu]],["Not",[Wu]],["Pad",[Hl]],["Pow",[pd]],["QuickGelu",[od,nr]],["Range",[pc]],["Reciprocal",[Hu]],["ReduceMin",[du]],["ReduceMean",[ou]],["ReduceMax",[uu]],["ReduceSum",[cu]],["ReduceProd",[lu]],["ReduceL1",[iu]],["ReduceL2",[au]],["ReduceLogSum",[mu]],["ReduceLogSumExp",[su]],["ReduceSumSquare",[pu]],["Relu",[Fu]],["Resize",[wc,_c]],["RotaryEmbedding",[kl]],["ScatterND",[hc,fc]],["Sigmoid",[qu]],["Sin",[Zu]],["Sinh",[Qu]],["Slice",[Tc,Ic]],["SkipLayerNormalization",[$c]],["Split",[Al,El]],["Sqrt",[Yu]],["Softmax",[Ac,Ec]],["Sub",[md]],["Tan",[Xu]],["Tanh",[ed]],["ThresholdedRelu",[rd,nr]],["Tile",[Oc]],["Transpose",[Fs,qs]],["Where",[Dc]]])});var fn,Uc=V(()=>{"use strict";Ve();nt();ae();fn=class{constructor(e){this.backend=e;this.repo=new Map,this.attributesBound=!1}getArtifact(e){return this.repo.get(e)}setArtifact(e,r){this.repo.set(e,r)}run(e,r,n,o,i){Ne(e.programInfo.name);let s=this.backend.device,u=this.backend.getComputePassEncoder();this.backend.writeTimestamp(this.backend.pendingDispatchNumber*2);let d=[];for(let p of r)d.push({binding:d.length,resource:{buffer:p.buffer}});for(let p of n)d.push({binding:d.length,resource:{buffer:p.buffer}});i&&d.push({binding:d.length,resource:i});let c=s.createBindGroup({layout:e.computePipeline.getBindGroupLayout(0),entries:d,label:e.programInfo.name});if(this.backend.sessionStatus==="capturing"){let p={kernelId:this.backend.currentKernelId,computePipeline:e.computePipeline,bindGroup:c,dispatchGroup:o};this.backend.capturedCommandList.get(this.backend.currentSessionId).push(p)}u.setPipeline(e.computePipeline),u.setBindGroup(0,c),u.dispatchWorkgroups(...o),this.backend.writeTimestamp(this.backend.pendingDispatchNumber*2+1),this.backend.pendingDispatchNumber++,(this.backend.pendingDispatchNumber>=this.backend.maxDispatchNumber||this.backend.queryType==="at-passes")&&this.backend.endComputePass(),this.backend.pendingDispatchNumber>=this.backend.maxDispatchNumber&&this.backend.flush(),Me(e.programInfo.name)}dispose(){}build(e,r){Ne(e.name);let n=this.backend.device,o=[];[{feature:"shader-f16",extension:"f16"},{feature:"subgroups",extension:"subgroups"}].forEach(m=>{n.features.has(m.feature)&&o.push(`enable ${m.extension};`)});let s=Gs(r,this.backend.device.limits),u=e.getShaderSource(s),d=`${o.join(`
`)}
${s.additionalImplementations}
${u}`,c=n.createShaderModule({code:d,label:e.name});se("verbose",()=>`[WebGPU] ${e.name} shader code: ${d}`);let p=n.createComputePipeline({compute:{module:c,entryPoint:"main"},layout:"auto",label:e.name});return Me(e.name),{programInfo:e,computePipeline:p,uniformVariablesInfo:s.variablesInfo}}normalizeDispatchGroupSize(e){let r=typeof e=="number"?e:e.x,n=typeof e=="number"?1:e.y||1,o=typeof e=="number"?1:e.z||1,i=this.backend.device.limits.maxComputeWorkgroupsPerDimension;if(r<=i&&n<=i&&o<=i)return[r,n,o];let s=r*n*o,u=Math.ceil(Math.sqrt(s));if(u>i){if(u=Math.ceil(Math.cbrt(s)),u>i)throw new Error("Total dispatch size exceeds WebGPU maximum.");return[u,u,u]}else return[u,u,1]}}});var Nc={};Vt(Nc,{WebGpuBackend:()=>Do});var Nb,Vb,zo,Do,Vc=V(()=>{"use strict";Ve();J();nt();no();Ls();Rc();Uc();Nb=(t,e)=>{if(e.length!==t.length)throw new Error(`inputDependencies length ${e.length} is not equal to inputTensors length ${t.length}.`);let r=[];for(let n=0;n<t.length;++n){let o=t[n].dataType;switch(e[n]){case"none":{r.push("");break}case"type":{r.push(`${o}`);break}case"rank":{let i=t[n].dims.length;r.push(`${o};${i}`);break}case"dims":{let i=t[n].dims.join(",");r.push(`${o};${i}`);break}default:throw new Error(`unsupported input dependency: ${e[n]}`)}}return r.join("|")},Vb=(t,e,r)=>{let n=t.name;return t.shaderCache?.hint&&(n+="["+t.shaderCache.hint+"]"),n+=":"+r+`:${Nb(e,t.shaderCache?.inputDependencies??new Array(e.length).fill("dims"))}`,n},zo=class{constructor(e){e&&(this.architecture=e.architecture,this.vendor=e.vendor)}isArchitecture(e){return this.architecture===e}isVendor(e){return this.vendor===e}},Do=class{constructor(){this.currentSessionId=null;this.currentKernelId=null;this.commandEncoder=null;this.computePassEncoder=null;this.maxDispatchNumber=16;this.pendingDispatchNumber=0;this.pendingKernels=[];this.pendingQueries=new Map;this.sessionStatus="default";this.capturedCommandList=new Map;this.capturedPendingKernels=new Map;this.sessionExternalDataMapping=new Map}get currentKernelCustomData(){if(this.currentKernelId===null)throw new Error("currentKernelCustomData(): currentKernelId is null. (should not happen)");let e=this.kernelCustomData.get(this.currentKernelId);return e||(e={},this.kernelCustomData.set(this.currentKernelId,e)),e}async initialize(e,r){this.env=e;let n=[],o={requiredLimits:{maxComputeWorkgroupStorageSize:r.limits.maxComputeWorkgroupStorageSize,maxComputeWorkgroupsPerDimension:r.limits.maxComputeWorkgroupsPerDimension,maxStorageBufferBindingSize:r.limits.maxStorageBufferBindingSize,maxBufferSize:r.limits.maxBufferSize,maxComputeInvocationsPerWorkgroup:r.limits.maxComputeInvocationsPerWorkgroup,maxComputeWorkgroupSizeX:r.limits.maxComputeWorkgroupSizeX,maxComputeWorkgroupSizeY:r.limits.maxComputeWorkgroupSizeY,maxComputeWorkgroupSizeZ:r.limits.maxComputeWorkgroupSizeZ},requiredFeatures:n},i=s=>r.features.has(s)&&n.push(s)&&!0;i("chromium-experimental-timestamp-query-inside-passes")||i("timestamp-query"),i("shader-f16"),i("subgroups"),this.device=await r.requestDevice(o),this.adapterInfo=new zo(r.info||await r.requestAdapterInfo()),this.gpuDataManager=Vs(this),this.programManager=new fn(this),this.kernels=new Map,this.kernelPersistentData=new Map,this.kernelCustomData=new Map,Wr(e.logLevel,!!e.debug),this.device.onuncapturederror=s=>{s.error instanceof GPUValidationError&&console.error(`An uncaught WebGPU validation error was raised: ${s.error.message}`)},Object.defineProperty(this.env.webgpu,"device",{value:this.device,writable:!1,enumerable:!0,configurable:!1}),Object.defineProperty(this.env.webgpu,"adapter",{value:r,writable:!1,enumerable:!0,configurable:!1}),this.setQueryType()}dispose(){typeof this.querySet<"u"&&this.querySet.destroy(),this.gpuDataManager.dispose()}getCommandEncoder(){return this.commandEncoder||(this.commandEncoder=this.device.createCommandEncoder()),this.commandEncoder}getComputePassEncoder(){if(!this.computePassEncoder){let e=this.getCommandEncoder(),r={};this.queryType==="at-passes"&&(r.timestampWrites={querySet:this.querySet,beginningOfPassWriteIndex:this.pendingDispatchNumber*2,endOfPassWriteIndex:this.pendingDispatchNumber*2+1}),this.computePassEncoder=e.beginComputePass(r)}return this.computePassEncoder}endComputePass(){this.computePassEncoder&&(this.computePassEncoder.end(),this.computePassEncoder=null)}flush(){if(!this.commandEncoder)return;Ne(),this.endComputePass();let e;this.queryType!=="none"&&(this.commandEncoder.resolveQuerySet(this.querySet,0,this.pendingDispatchNumber*2,this.queryResolveBuffer,0),e=this.device.createBuffer({size:this.pendingDispatchNumber*2*8,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),this.pendingQueries.set(e,this.pendingKernels),this.pendingKernels=[],this.commandEncoder.copyBufferToBuffer(this.queryResolveBuffer,0,e,0,this.pendingDispatchNumber*2*8)),this.device.queue.submit([this.commandEncoder.finish()]),this.gpuDataManager.refreshPendingBuffers(),this.commandEncoder=null,this.pendingDispatchNumber=0,this.queryType!=="none"&&e.mapAsync(GPUMapMode.READ).then(()=>{let r=new BigUint64Array(e.getMappedRange()),n=this.pendingQueries.get(e);for(let o=0;o<r.length/2;o++){let i=n[o],s=i.kernelId,u=this.kernels.get(s),d=u.kernelType,c=u.kernelName,p=i.programName,m=i.inputTensorViews,g=i.outputTensorViews,y=r[o*2],b=r[o*2+1];typeof this.queryTimeBase>"u"&&(this.queryTimeBase=y);let w=Number(y-this.queryTimeBase),S=Number(b-this.queryTimeBase);if(!Number.isSafeInteger(w)||!Number.isSafeInteger(S))throw new RangeError("incorrect timestamp range");if(this.env.webgpu.profiling?.ondata)this.env.webgpu.profiling.ondata({version:1,inputsMetadata:m.map(x=>({dims:x.dims,dataType:rt(x.dataType)})),outputsMetadata:g.map(x=>({dims:x.dims,dataType:rt(x.dataType)})),kernelId:s,kernelType:d,kernelName:c,programName:p,startTime:w,endTime:S});else{let x="";m.forEach((T,I)=>{x+=`input[${I}]: [${T.dims}] | ${rt(T.dataType)}, `});let $="";g.forEach((T,I)=>{$+=`output[${I}]: [${T.dims}] | ${rt(T.dataType)}, `}),console.log(`[profiling] kernel "${s}|${d}|${c}|${p}" ${x}${$}start time: ${w} ns, execution time: ${S-w} ns`)}Tr("GPU",`${p}::${y}::${b}`)}e.unmap(),this.pendingQueries.delete(e)}),Me()}run(e,r,n,o,i,s){Ne(e.name);let u=[];for(let T=0;T<r.length;++T){let I=r[T].data;if(I===0)continue;let E=this.gpuDataManager.get(I);if(!E)throw new Error(`no GPU data for input: ${I}`);u.push(E)}let{outputs:d,dispatchGroup:c,programUniforms:p}=e.getRunData(r),m=n.length===0?d.map((T,I)=>I):n;if(m.length!==d.length)throw new Error(`Output size ${m.length} must be equal to ${d.length}.`);let g=[],y=[];for(let T=0;T<d.length;++T){if(!Number.isInteger(m[T])||m[T]<-3||m[T]>=s)throw new Error(`Invalid output index: ${m[T]}`);if(m[T]===-3)continue;let I=m[T]===-1,E=m[T]===-2,A=I||E?i(d[T].dataType,d[T].dims):o(m[T],d[T].dataType,d[T].dims);if(g.push(A),A.data===0)continue;let z=this.gpuDataManager.get(A.data);if(!z)throw new Error(`no GPU data for output: ${A.data}`);if(I&&this.temporaryData.push(z),E){let v=this.kernelPersistentData.get(this.currentKernelId);v||(v=[],this.kernelPersistentData.set(this.currentKernelId,v)),v.push(z)}y.push(z)}if(u.length!==r.length||y.length!==g.length){if(y.length===0)return Me(e.name),g;throw new Error(`Program ${e.name} has zero-sized tensor(s) in inputs or outputs. This is not supported now.`)}let b;if(p){let T=0,I=[];p.forEach(v=>{let M=typeof v.data=="number"?[v.data]:v.data;if(M.length===0)return;let N=v.type===10?2:4,K,q;v.type===10?(q=M.length>4?16:M.length>2?8:M.length*N,K=M.length>4?16:N*M.length):(q=M.length<=2?M.length*N:16,K=16),T=Math.ceil(T/q)*q,I.push(T);let Q=v.type===10?8:4;T+=M.length>4?Math.ceil(M.length/Q)*K:M.length*N});let E=16;T=Math.ceil(T/E)*E;let A=new ArrayBuffer(T);p.forEach((v,M)=>{let N=I[M],K=typeof v.data=="number"?[v.data]:v.data;if(v.type===6)new Int32Array(A,N,K.length).set(K);else if(v.type===12)new Uint32Array(A,N,K.length).set(K);else if(v.type===10)new Uint16Array(A,N,K.length).set(K);else if(v.type===1)new Float32Array(A,N,K.length).set(K);else throw new Error(`Unsupported uniform type: ${rt(v.type)}`)});let z=this.gpuDataManager.create(T,GPUBufferUsage.COPY_DST|GPUBufferUsage.UNIFORM);this.device.queue.writeBuffer(z.buffer,0,A,0,T),this.gpuDataManager.release(z.id),b={offset:0,size:T,buffer:z.buffer}}let w=this.programManager.normalizeDispatchGroupSize(c),S=w[1]===1&&w[2]===1,x=Vb(e,r,S),$=this.programManager.getArtifact(x);if($||($=this.programManager.build(e,w),this.programManager.setArtifact(x,$),se("info",()=>`[artifact] key: ${x}, programName: ${e.name}`)),p&&$.uniformVariablesInfo){if(p.length!==$.uniformVariablesInfo.length)throw new Error(`Uniform variables count mismatch: expect ${$.uniformVariablesInfo.length}, got ${p.length} in program "${$.programInfo.name}".`);for(let T=0;T<p.length;T++){let I=p[T],E=I.type,A=typeof I.data=="number"?1:I.data.length,[z,v]=$.uniformVariablesInfo[T];if(E!==z||A!==v)throw new Error(`Uniform variable ${T} mismatch: expect type ${z} with size ${v}, got type ${E} with size ${A} in program "${$.programInfo.name}".`)}}if(se("info",()=>`[ProgramManager] run "${e.name}" (key=${x}) with ${w[0]}x${w[1]}x${w[2]}`),this.queryType!=="none"||this.sessionStatus==="capturing"){let T={kernelId:this.currentKernelId,programName:$.programInfo.name,inputTensorViews:r,outputTensorViews:g};this.pendingKernels.push(T),this.sessionStatus==="capturing"&&this.capturedPendingKernels.get(this.currentSessionId).push(T)}return this.programManager.run($,u,y,w,b),Me(e.name),g}upload(e,r){this.gpuDataManager.upload(e,r)}memcpy(e,r){this.gpuDataManager.memcpy(e,r)}async download(e,r){await this.gpuDataManager.download(e,r)}alloc(e){return this.gpuDataManager.create(e).id}free(e){return this.gpuDataManager.release(e)}createKernel(e,r,n,o){let i=Mc.get(e);if(!i)throw new Error(`kernel not implemented: ${e}`);let s={kernelType:e,kernelName:o,kernelEntry:i[0],attributes:[i[1],n]};this.kernels.set(r,s)}releaseKernel(e){let r=this.kernelPersistentData.get(e);if(r){for(let n of r)this.gpuDataManager.release(n.id);this.kernelPersistentData.delete(e)}this.kernelCustomData.delete(e),this.kernels.delete(e)}computeKernel(e,r,n){let o=this.kernels.get(e);if(!o)throw new Error(`kernel not created: ${e}`);let i=o.kernelType,s=o.kernelName,u=o.kernelEntry,d=o.attributes;if(this.currentKernelId!==null)throw new Error(`kernel "[${i}] ${s}" is not allowed to be called recursively`);this.currentKernelId=e,d[0]&&(d[1]=d[0](d[1]),d[0]=void 0),se("info",()=>`[WebGPU] Start to run kernel "[${i}] ${s}"...`);let c=this.env.debug;this.temporaryData=[];try{return c&&this.device.pushErrorScope("validation"),u(r,d[1]),0}catch(p){return n.push(Promise.resolve(`[WebGPU] Kernel "[${i}] ${s}" failed. ${p}`)),1}finally{c&&n.push(this.device.popErrorScope().then(p=>p?`GPU validation error for kernel "[${i}] ${s}": ${p.message}`:null));for(let p of this.temporaryData)this.gpuDataManager.release(p.id);this.temporaryData=[],this.currentKernelId=null}}registerBuffer(e,r,n,o){let i=this.sessionExternalDataMapping.get(e);i||(i=new Map,this.sessionExternalDataMapping.set(e,i));let s=i.get(r),u=this.gpuDataManager.registerExternalBuffer(n,o,s);return i.set(r,[u,n]),u}unregisterBuffers(e){let r=this.sessionExternalDataMapping.get(e);r&&(r.forEach(n=>this.gpuDataManager.unregisterExternalBuffer(n[0])),this.sessionExternalDataMapping.delete(e))}getBuffer(e){let r=this.gpuDataManager.get(e);if(!r)throw new Error(`no GPU data for buffer: ${e}`);return r.buffer}createDownloader(e,r,n){return async()=>{let o=await lo(this,e,r);return Hr(o.buffer,n)}}writeTimestamp(e){this.queryType==="inside-passes"&&this.computePassEncoder.writeTimestamp(this.querySet,e)}setQueryType(){this.queryType="none",(this.env.webgpu.profiling?.mode==="default"||(typeof this.env.trace>"u"?this.env.wasm.trace:this.env.trace))&&(this.device.features.has("chromium-experimental-timestamp-query-inside-passes")?this.queryType="inside-passes":this.device.features.has("timestamp-query")&&(this.queryType="at-passes"),this.queryType!=="none"&&typeof this.querySet>"u"&&(this.querySet=this.device.createQuerySet({type:"timestamp",count:this.maxDispatchNumber*2}),this.queryResolveBuffer=this.device.createBuffer({size:this.maxDispatchNumber*2*8,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.QUERY_RESOLVE})))}captureBegin(){se("info","captureBegin"),this.capturedCommandList.get(this.currentSessionId)||this.capturedCommandList.set(this.currentSessionId,[]),this.capturedPendingKernels.get(this.currentSessionId)||this.capturedPendingKernels.set(this.currentSessionId,[]),this.flush(),this.sessionStatus="capturing"}captureEnd(){se("info","captureEnd"),this.flush(),this.sessionStatus="default"}replay(){se("info","replay"),this.sessionStatus="replaying";let e=this.capturedCommandList.get(this.currentSessionId),r=this.capturedPendingKernels.get(this.currentSessionId),n=e.length;this.pendingKernels=[];for(let o=0;o<n;o++){let i=this.getComputePassEncoder(),s=e[o];this.writeTimestamp(this.pendingDispatchNumber*2),i.setPipeline(s.computePipeline),i.setBindGroup(0,s.bindGroup),i.dispatchWorkgroups(...s.dispatchGroup),this.writeTimestamp(this.pendingDispatchNumber*2+1),this.pendingDispatchNumber++,this.queryType!=="none"&&this.pendingKernels.push(r[o]),(this.pendingDispatchNumber>=this.maxDispatchNumber||this.queryType==="at-passes")&&this.endComputePass(),this.pendingDispatchNumber>=this.maxDispatchNumber&&this.flush()}this.flush(),this.sessionStatus="default"}onCreateSession(){this.gpuDataManager.onCreateSession()}onReleaseSession(e){this.unregisterBuffers(e),this.capturedCommandList.has(e)&&this.capturedCommandList.delete(e),this.capturedPendingKernels.has(e)&&this.capturedPendingKernels.delete(e),this.gpuDataManager.onReleaseSession(e)}onRunStart(e){this.currentSessionId=e,this.setQueryType()}}});var Lc={};Vt(Lc,{init:()=>Lb});var sr,Bo,Lb,Wc=V(()=>{"use strict";J();nt();ne();Ms();sr=class t{constructor(e,r,n,o){this.module=e;this.dataType=r;this.data=n;this.dims=o}getFloat32Array(){if(this.dataType!==1)throw new Error("Invalid data type");let e=k.size(this.dims);return e===0?new Float32Array:new Float32Array(this.module.HEAP8.buffer,this.data,e)}getBigInt64Array(){if(this.dataType!==7)throw new Error("Invalid data type");let e=k.size(this.dims);return e===0?new BigInt64Array:new BigInt64Array(this.module.HEAP8.buffer,this.data,e)}getInt32Array(){if(this.dataType!==6)throw new Error("Invalid data type");let e=k.size(this.dims);return e===0?new Int32Array:new Int32Array(this.module.HEAP8.buffer,this.data,e)}getUint16Array(){if(this.dataType!==10&&this.dataType!==4)throw new Error("Invalid data type");let e=k.size(this.dims);return e===0?new Uint16Array:new Uint16Array(this.module.HEAP8.buffer,this.data,e)}reshape(e){if(k.size(e)!==k.size(this.dims))throw new Error("Invalid new shape");return new t(this.module,this.dataType,this.data,e)}},Bo=class{constructor(e,r,n){this.module=e;this.backend=r;this.customDataOffset=0;this.customDataSize=0;this.adapterInfo=r.adapterInfo;let o=e.PTR_SIZE,i=n/e.PTR_SIZE,s=o===4?"i32":"i64";this.opKernelContext=Number(e.getValue(o*i++,s));let u=Number(e.getValue(o*i++,s));this.outputCount=Number(e.getValue(o*i++,s)),this.customDataOffset=Number(e.getValue(o*i++,"*")),this.customDataSize=Number(e.getValue(o*i++,s));let d=[];for(let c=0;c<u;c++){let p=Number(e.getValue(o*i++,s)),m=Number(e.getValue(o*i++,"*")),g=Number(e.getValue(o*i++,s)),y=[];for(let b=0;b<g;b++)y.push(Number(e.getValue(o*i++,s)));d.push(new sr(e,p,m,y))}this.inputs=d}get kernelCustomData(){return this.backend.currentKernelCustomData}get customDataBuffer(){return this.module.HEAPU8.subarray(this.customDataOffset,this.customDataOffset+this.customDataSize)}compute(e,r){let n=r?.inputs?.map(u=>typeof u=="number"?this.inputs[u]:u)??this.inputs,o=r?.outputs??[],i=(u,d,c)=>new sr(this.module,d,this.output(u,c),c),s=(u,d)=>{let c=xt(u,d);if(!c)throw new Error(`Unsupported data type: ${u}`);let p=c>0?this.backend.gpuDataManager.create(c).id:0;return new sr(this.module,u,p,d)};return this.backend.run(e,n,o,i,s,this.outputCount)}output(e,r){let n=this.module.stackSave();try{let o=this.module.PTR_SIZE,i=o===4?"i32":"i64",s=this.module.stackAlloc((1+r.length)*o);this.module.setValue(s,r.length,i);for(let u=0;u<r.length;u++)this.module.setValue(s+o*(u+1),r[u],i);return this.module._JsepOutput(this.opKernelContext,e,s)}catch(o){throw new Error(`Failed to generate kernel's output[${e}] with dims [${r}]. If you are running with pre-allocated output, please make sure the output type/dims are correct. Error: ${o}`)}finally{this.module.stackRestore(n)}}},Lb=async(t,e,r,n)=>{let o=e.jsepInit;if(!o)throw new Error("Failed to initialize JSEP. The WebAssembly module is not built with JSEP support.");if(t==="webgpu"){let i=(Vc(),Yt(Nc)).WebGpuBackend,s=new i;await s.initialize(r,n),o("webgpu",[s,u=>s.alloc(Number(u)),u=>s.free(u),(u,d,c,p=!1)=>{if(p)se("verbose",()=>`[WebGPU] jsepCopyGpuToGpu: src=${Number(u)}, dst=${Number(d)}, size=${Number(c)}`),s.memcpy(Number(u),Number(d));else{se("verbose",()=>`[WebGPU] jsepCopyCpuToGpu: dataOffset=${Number(u)}, gpuDataId=${Number(d)}, size=${Number(c)}`);let m=e.HEAPU8.subarray(Number(u>>>0),Number(u>>>0)+Number(c));s.upload(Number(d),m)}},async(u,d,c)=>{se("verbose",()=>`[WebGPU] jsepCopyGpuToCpu: gpuDataId=${u}, dataOffset=${d}, size=${c}`),await s.download(Number(u),()=>e.HEAPU8.subarray(Number(d)>>>0,Number(d+c)>>>0))},(u,d,c)=>s.createKernel(u,Number(d),c,e.UTF8ToString(e._JsepGetNodeName(Number(d)))),u=>s.releaseKernel(u),(u,d,c,p)=>{se("verbose",()=>`[WebGPU] jsepRun: sessionHandle=${c}, kernel=${u}, contextDataOffset=${d}`);let m=new Bo(e,s,Number(d));return s.computeKernel(Number(u),m,p)},()=>s.captureBegin(),()=>s.captureEnd(),()=>s.replay()])}else{let i=new jr(r);o("webnn",[i,()=>i.reserveTensorId(),s=>i.releaseTensorId(s),async(s,u,d,c,p)=>i.ensureTensor(s,u,d,c,p),(s,u)=>{i.uploadTensor(s,u)},async(s,u)=>i.downloadTensor(s,u),(s,u)=>i.registerMLContext(s,u),!!r.trace])}}});var Wb,kr,Pr,Mt,Gb,Gc,Jt,Or,zr,Hc,Dr,Br,Mr,Zn=V(()=>{"use strict";Ve();xs();Ts();J();vt();Ur();to();Wb=(t,e)=>{ge()._OrtInit(t,e)!==0&&me("Can't initialize onnxruntime.")},kr=async t=>{Wb(t.wasm.numThreads,tr(t.logLevel))},Pr=async(t,e)=>{ge().asyncInit?.();let r=t.webgpu.adapter;if(e==="webgpu"){if(typeof navigator>"u"||!navigator.gpu)throw new Error("WebGPU is not supported in current environment");if(r){if(typeof r.limits!="object"||typeof r.features!="object"||typeof r.requestDevice!="function")throw new Error("Invalid GPU adapter set in `env.webgpu.adapter`. It must be a GPUAdapter object.")}else{let n=t.webgpu.powerPreference;if(n!==void 0&&n!=="low-power"&&n!=="high-performance")throw new Error(`Invalid powerPreference setting: "${n}"`);let o=t.webgpu.forceFallbackAdapter;if(o!==void 0&&typeof o!="boolean")throw new Error(`Invalid forceFallbackAdapter setting: "${o}"`);if(r=await navigator.gpu.requestAdapter({powerPreference:n,forceFallbackAdapter:o}),!r)throw new Error('Failed to get GPU adapter. You may need to enable flag "--enable-unsafe-webgpu" if you are using Chrome.')}}if(e==="webnn"&&(typeof navigator>"u"||!navigator.ml))throw new Error("WebNN is not supported in current environment");{let n=(Wc(),Yt(Lc)).init;e==="webgpu"&&await n("webgpu",ge(),t,r),e==="webnn"&&await n("webnn",ge(),t)}},Mt=new Map,Gb=t=>{let e=ge(),r=e.stackSave();try{let n=e.PTR_SIZE,o=e.stackAlloc(2*n);e._OrtGetInputOutputCount(t,o,o+n)!==0&&me("Can't get session input/output count.");let s=n===4?"i32":"i64";return[Number(e.getValue(o,s)),Number(e.getValue(o+n,s))]}finally{e.stackRestore(r)}},Gc=(t,e)=>{let r=ge(),n=r.stackSave(),o=0;try{let i=r.PTR_SIZE,s=r.stackAlloc(2*i);r._OrtGetInputOutputMetadata(t,e,s,s+i)!==0&&me("Can't get session input/output metadata.");let d=Number(r.getValue(s,"*"));o=Number(r.getValue(s+i,"*"));let c=r.HEAP32[o/4];if(c===0)return[d,0];let p=r.HEAPU32[o/4+1],m=[];for(let g=0;g<p;g++){let y=Number(r.getValue(o+8+g*i,"*"));m.push(y!==0?r.UTF8ToString(y):Number(r.getValue(o+8+(g+p)*i,"*")))}return[d,c,m]}finally{r.stackRestore(n),o!==0&&r._OrtFree(o)}},Jt=t=>{let e=ge(),r=e._malloc(t.byteLength);if(r===0)throw new Error(`Can't create a session. failed to allocate a buffer of size ${t.byteLength}.`);return e.HEAPU8.set(t,r),[r,t.byteLength]},Or=async(t,e)=>{let r,n,o=ge();Array.isArray(t)?[r,n]=t:t.buffer===o.HEAPU8.buffer?[r,n]=[t.byteOffset,t.byteLength]:[r,n]=Jt(t);let i=0,s=0,u=0,d=[],c=[],p=[];try{if([s,d]=await Ss(e),e?.externalData&&o.mountExternalData){let I=[];for(let E of e.externalData){let A=typeof E=="string"?E:E.path;I.push(rr(typeof E=="string"?E:E.data).then(z=>{o.mountExternalData(A,z)}))}await Promise.all(I)}for(let I of e?.executionProviders??[])if((typeof I=="string"?I:I.name)==="webnn"){if(o.shouldTransferToMLTensor=!1,typeof I!="string"){let A=I,z=A?.context,v=A?.gpuDevice,M=A?.deviceType,N=A?.powerPreference;z?o.currentContext=z:v?o.currentContext=await o.webnnCreateMLContext(v):o.currentContext=await o.webnnCreateMLContext({deviceType:M,powerPreference:N})}else o.currentContext=await o.webnnCreateMLContext();break}i=await o._OrtCreateSession(r,n,s),o.webgpuOnCreateSession?.(i),i===0&&me("Can't create a session."),o.jsepOnCreateSession?.(),o.currentContext&&(o.webnnRegisterMLContext(i,o.currentContext),o.currentContext=void 0,o.shouldTransferToMLTensor=!0);let[m,g]=Gb(i),y=!!e?.enableGraphCapture,b=[],w=[],S=[],x=[],$=[];for(let I=0;I<m;I++){let[E,A,z]=Gc(i,I);E===0&&me("Can't get an input name."),c.push(E);let v=o.UTF8ToString(E);b.push(v),S.push(A===0?{name:v,isTensor:!1}:{name:v,isTensor:!0,type:rt(A),shape:z})}for(let I=0;I<g;I++){let[E,A,z]=Gc(i,I+m);E===0&&me("Can't get an output name."),p.push(E);let v=o.UTF8ToString(E);w.push(v),x.push(A===0?{name:v,isTensor:!1}:{name:v,isTensor:!0,type:rt(A),shape:z});{if(y&&e?.preferredOutputLocation===void 0){$.push("gpu-buffer");continue}let M=typeof e?.preferredOutputLocation=="string"?e.preferredOutputLocation:e?.preferredOutputLocation?.[v]??"cpu",N=o.webnnIsGraphOutput;if(M==="cpu"&&N&&N(i,v)){$.push("ml-tensor-cpu-output");continue}if(M!=="cpu"&&M!=="cpu-pinned"&&M!=="gpu-buffer"&&M!=="ml-tensor")throw new Error(`Not supported preferred output location: ${M}.`);if(y&&M!=="gpu-buffer")throw new Error(`Not supported preferred output location: ${M}. Only 'gpu-buffer' location is supported when enableGraphCapture is true.`);$.push(M)}}let T=null;return $.some(I=>I==="gpu-buffer"||I==="ml-tensor"||I==="ml-tensor-cpu-output")&&(u=o._OrtCreateBinding(i),u===0&&me("Can't create IO binding."),T={handle:u,outputPreferredLocations:$,outputPreferredLocationsEncoded:$.map(I=>I==="ml-tensor-cpu-output"?"ml-tensor":I).map(I=>eo(I))}),Mt.set(i,[i,c,p,T,y,!1]),[i,b,w,S,x]}catch(m){throw c.forEach(g=>o._OrtFree(g)),p.forEach(g=>o._OrtFree(g)),u!==0&&o._OrtReleaseBinding(u)!==0&&me("Can't release IO binding."),i!==0&&o._OrtReleaseSession(i)!==0&&me("Can't release session."),m}finally{o._free(r),s!==0&&o._OrtReleaseSessionOptions(s)!==0&&me("Can't release session options."),d.forEach(m=>o._free(m)),o.unmountExternalData?.()}},zr=t=>{let e=ge(),r=Mt.get(t);if(!r)throw new Error(`cannot release session. invalid session id: ${t}`);let[n,o,i,s,u]=r;s&&(u&&e._OrtClearBoundOutputs(s.handle)!==0&&me("Can't clear bound outputs."),e._OrtReleaseBinding(s.handle)!==0&&me("Can't release IO binding.")),e.jsepOnReleaseSession?.(t),e.webnnOnReleaseSession?.(t),e.webgpuOnReleaseSession?.(t),o.forEach(d=>e._OrtFree(d)),i.forEach(d=>e._OrtFree(d)),e._OrtReleaseSession(n)!==0&&me("Can't release session."),Mt.delete(t)},Hc=async(t,e,r,n,o,i,s=!1)=>{if(!t){e.push(0);return}let u=ge(),d=u.PTR_SIZE,c=t[0],p=t[1],m=t[3],g=m,y,b;if(c==="string"&&(m==="gpu-buffer"||m==="ml-tensor"))throw new Error("String tensor is not supported on GPU.");if(s&&m!=="gpu-buffer")throw new Error(`External buffer must be provided for input/output index ${i} when enableGraphCapture is true.`);if(m==="gpu-buffer"){let x=t[2].gpuBuffer;b=xt($t(c),p);{let $=u.jsepRegisterBuffer;if(!$)throw new Error('Tensor location "gpu-buffer" is not supported without using WebGPU.');y=$(n,i,x,b)}}else if(m==="ml-tensor"){let x=t[2].mlTensor;b=xt($t(c),p);let $=u.webnnRegisterMLTensor;if(!$)throw new Error('Tensor location "ml-tensor" is not supported without using WebNN.');y=$(n,x,$t(c),p)}else{let x=t[2];if(Array.isArray(x)){b=d*x.length,y=u._malloc(b),r.push(y);for(let $=0;$<x.length;$++){if(typeof x[$]!="string")throw new TypeError(`tensor data at index ${$} is not a string`);u.setValue(y+$*d,We(x[$],r),"*")}}else{let $=u.webnnIsGraphInput,T=u.webnnIsGraphOutput;if(c!=="string"&&$&&T){let I=u.UTF8ToString(o);if($(n,I)||T(n,I)){let E=$t(c);b=xt(E,p),g="ml-tensor";let A=u.webnnCreateTemporaryTensor,z=u.webnnUploadTensor;if(!A||!z)throw new Error('Tensor location "ml-tensor" is not supported without using WebNN.');let v=await A(n,E,p);z(v,new Uint8Array(x.buffer,x.byteOffset,x.byteLength)),y=v}else b=x.byteLength,y=u._malloc(b),r.push(y),u.HEAPU8.set(new Uint8Array(x.buffer,x.byteOffset,b),y)}else b=x.byteLength,y=u._malloc(b),r.push(y),u.HEAPU8.set(new Uint8Array(x.buffer,x.byteOffset,b),y)}}let w=u.stackSave(),S=u.stackAlloc(4*p.length);try{p.forEach(($,T)=>u.setValue(S+T*d,$,d===4?"i32":"i64"));let x=u._OrtCreateTensor($t(c),y,b,S,p.length,eo(g));x===0&&me(`Can't create tensor for input/output. session=${n}, index=${i}.`),e.push(x)}finally{u.stackRestore(w)}},Dr=async(t,e,r,n,o,i)=>{let s=ge(),u=s.PTR_SIZE,d=Mt.get(t);if(!d)throw new Error(`cannot run inference. invalid session id: ${t}`);let c=d[0],p=d[1],m=d[2],g=d[3],y=d[4],b=d[5],w=e.length,S=n.length,x=0,$=[],T=[],I=[],E=[],A=[],z=s.stackSave(),v=s.stackAlloc(w*u),M=s.stackAlloc(w*u),N=s.stackAlloc(S*u),K=s.stackAlloc(S*u);try{[x,$]=$s(i),wt("wasm prepareInputOutputTensor");for(let W=0;W<w;W++)await Hc(r[W],T,E,t,p[e[W]],e[W],y);for(let W=0;W<S;W++)await Hc(o[W],I,E,t,m[n[W]],w+n[W],y);_t("wasm prepareInputOutputTensor");for(let W=0;W<w;W++)s.setValue(v+W*u,T[W],"*"),s.setValue(M+W*u,p[e[W]],"*");for(let W=0;W<S;W++)s.setValue(N+W*u,I[W],"*"),s.setValue(K+W*u,m[n[W]],"*");if(g&&!b){let{handle:W,outputPreferredLocations:j,outputPreferredLocationsEncoded:Y}=g;if(p.length!==w)throw new Error(`input count from feeds (${w}) is expected to be always equal to model's input count (${p.length}).`);wt("wasm bindInputsOutputs");for(let Z=0;Z<w;Z++){let te=e[Z];await s._OrtBindInput(W,p[te],T[Z])!==0&&me(`Can't bind input[${Z}] for session=${t}.`)}for(let Z=0;Z<S;Z++){let te=n[Z];o[Z]?.[3]?(A.push(I[Z]),s._OrtBindOutput(W,m[te],I[Z],0)!==0&&me(`Can't bind pre-allocated output[${Z}] for session=${t}.`)):s._OrtBindOutput(W,m[te],0,Y[te])!==0&&me(`Can't bind output[${Z}] to ${j[Z]} for session=${t}.`)}_t("wasm bindInputsOutputs"),Mt.set(t,[c,p,m,g,y,!0])}s.jsepOnRunStart?.(c),s.webnnOnRunStart?.(c);let q;g?q=await s._OrtRunWithBinding(c,g.handle,S,N,x):q=await s._OrtRun(c,M,v,w,K,S,N,x),q!==0&&me("failed to call OrtRun().");let Q=[],D=[];wt("wasm ProcessOutputTensor");for(let W=0;W<S;W++){let j=Number(s.getValue(N+W*u,"*"));if(j===I[W]||A.includes(I[W])){Q.push(o[W]),j!==I[W]&&s._OrtReleaseTensor(j)!==0&&me("Can't release tensor.");continue}let Y=s.stackSave(),Z=s.stackAlloc(4*u),te=!1,ie,we=0;try{s._OrtGetTensorData(j,Z,Z+u,Z+2*u,Z+3*u)!==0&&me(`Can't access output tensor data on index ${W}.`);let re=u===4?"i32":"i64",U=Number(s.getValue(Z,re));we=s.getValue(Z+u,"*");let X=s.getValue(Z+u*2,"*"),Se=Number(s.getValue(Z+u*3,re)),Be=[];for(let Ce=0;Ce<Se;Ce++)Be.push(Number(s.getValue(X+Ce*u,re)));s._OrtFree(X)!==0&&me("Can't free memory for tensor dims.");let ze=Be.reduce((Ce,$e)=>Ce*$e,1);ie=rt(U);let Xe=g?.outputPreferredLocations[n[W]];if(ie==="string"){if(Xe==="gpu-buffer"||Xe==="ml-tensor")throw new Error("String tensor is not supported on GPU.");let Ce=[];for(let $e=0;$e<ze;$e++){let Fe=s.getValue(we+$e*u,"*"),Ue=s.getValue(we+($e+1)*u,"*"),ve=$e===ze-1?void 0:Ue-Fe;Ce.push(s.UTF8ToString(Fe,ve))}Q.push([ie,Be,Ce,"cpu"])}else if(Xe==="gpu-buffer"&&ze>0){let Ce=s.jsepGetBuffer;if(!Ce)throw new Error('preferredLocation "gpu-buffer" is not supported without using WebGPU.');let $e=Ce(we),Fe=xt(U,ze);if(Fe===void 0||!Vr(ie))throw new Error(`Unsupported data type: ${ie}`);te=!0,Q.push([ie,Be,{gpuBuffer:$e,download:s.jsepCreateDownloader($e,Fe,ie),dispose:()=>{s._OrtReleaseTensor(j)!==0&&me("Can't release tensor.")}},"gpu-buffer"])}else if(Xe==="ml-tensor"&&ze>0){let Ce=s.webnnEnsureTensor,$e=s.webnnIsGraphInputOutputTypeSupported;if(!Ce||!$e)throw new Error('preferredLocation "ml-tensor" is not supported without using WebNN.');if(xt(U,ze)===void 0||!Lr(ie))throw new Error(`Unsupported data type: ${ie}`);if(!$e(t,ie,!1))throw new Error(`preferredLocation "ml-tensor" for ${ie} output is not supported by current WebNN Context.`);let Ue=await Ce(t,we,U,Be,!1);te=!0,Q.push([ie,Be,{mlTensor:Ue,download:s.webnnCreateMLTensorDownloader(we,ie),dispose:()=>{s.webnnReleaseTensorId(we),s._OrtReleaseTensor(j)}},"ml-tensor"])}else if(Xe==="ml-tensor-cpu-output"&&ze>0){let Ce=s.webnnCreateMLTensorDownloader(we,ie)(),$e=Q.length;te=!0,D.push((async()=>{let Fe=[$e,await Ce];return s.webnnReleaseTensorId(we),s._OrtReleaseTensor(j),Fe})()),Q.push([ie,Be,[],"cpu"])}else{let Ce=Lt(ie),$e=new Ce(ze);new Uint8Array($e.buffer,$e.byteOffset,$e.byteLength).set(s.HEAPU8.subarray(we,we+$e.byteLength)),Q.push([ie,Be,$e,"cpu"])}}finally{s.stackRestore(Y),ie==="string"&&we&&s._free(we),te||s._OrtReleaseTensor(j)}}g&&!y&&(s._OrtClearBoundOutputs(g.handle)!==0&&me("Can't clear bound outputs."),Mt.set(t,[c,p,m,g,y,!1]));for(let[W,j]of await Promise.all(D))Q[W][2]=j;return _t("wasm ProcessOutputTensor"),Q}finally{s.webnnOnRunEnd?.(c),s.stackRestore(z),T.forEach(q=>s._OrtReleaseTensor(q)),I.forEach(q=>s._OrtReleaseTensor(q)),E.forEach(q=>s._free(q)),x!==0&&s._OrtReleaseRunOptions(x),$.forEach(q=>s._free(q))}},Br=t=>{let e=ge(),r=Mt.get(t);if(!r)throw new Error("invalid session id");let n=r[0],o=e._OrtEndProfiling(n);o===0&&me("Can't get an profile file name."),e._OrtFree(o)},Mr=t=>{let e=[];for(let r of t){let n=r[2];!Array.isArray(n)&&"buffer"in n&&e.push(n.buffer)}return e}});var Rt,He,ur,gn,bn,hn,Mo,Ro,Ft,qt,Fb,Fc,qc,Kc,jc,Zc,Qc,Yc,Uo=V(()=>{"use strict";Ve();Zn();vt();Ar();Rt=()=>!!be.wasm.proxy&&typeof document<"u",ur=!1,gn=!1,bn=!1,Ro=new Map,Ft=(t,e)=>{let r=Ro.get(t);r?r.push(e):Ro.set(t,[e])},qt=()=>{if(ur||!gn||bn||!He)throw new Error("worker not ready")},Fb=t=>{switch(t.data.type){case"init-wasm":ur=!1,t.data.err?(bn=!0,Mo[1](t.data.err)):(gn=!0,Mo[0]()),hn&&(URL.revokeObjectURL(hn),hn=void 0);break;case"init-ep":case"copy-from":case"create":case"release":case"run":case"end-profiling":{let e=Ro.get(t.data.type);t.data.err?e.shift()[1](t.data.err):e.shift()[0](t.data.out);break}default:}},Fc=async()=>{if(!gn){if(ur)throw new Error("multiple calls to 'initWasm()' detected.");if(bn)throw new Error("previous call to 'initWasm()' failed.");if(ur=!0,Rt())return new Promise((t,e)=>{He?.terminate(),ws().then(([r,n])=>{try{He=n,He.onerror=i=>e(i),He.onmessage=Fb,Mo=[t,e];let o={type:"init-wasm",in:be};!o.in.wasm.wasmPaths&&(r||Yn)&&(o.in.wasm.wasmPaths={wasm:new URL("ort-wasm-simd-threaded.jsep.wasm",import.meta.url).href}),He.postMessage(o),hn=r}catch(o){e(o)}},e)});try{await Er(be.wasm),await kr(be),gn=!0}catch(t){throw bn=!0,t}finally{ur=!1}}},qc=async t=>{if(Rt())return qt(),new Promise((e,r)=>{Ft("init-ep",[e,r]);let n={type:"init-ep",in:{epName:t,env:be}};He.postMessage(n)});await Pr(be,t)},Kc=async t=>Rt()?(qt(),new Promise((e,r)=>{Ft("copy-from",[e,r]);let n={type:"copy-from",in:{buffer:t}};He.postMessage(n,[t.buffer])})):Jt(t),jc=async(t,e)=>{if(Rt()){if(e?.preferredOutputLocation)throw new Error('session option "preferredOutputLocation" is not supported for proxy.');return qt(),new Promise((r,n)=>{Ft("create",[r,n]);let o={type:"create",in:{model:t,options:{...e}}},i=[];t instanceof Uint8Array&&i.push(t.buffer),He.postMessage(o,i)})}else return Or(t,e)},Zc=async t=>{if(Rt())return qt(),new Promise((e,r)=>{Ft("release",[e,r]);let n={type:"release",in:t};He.postMessage(n)});zr(t)},Qc=async(t,e,r,n,o,i)=>{if(Rt()){if(r.some(s=>s[3]!=="cpu"))throw new Error("input tensor on GPU is not supported for proxy.");if(o.some(s=>s))throw new Error("pre-allocated output tensor is not supported for proxy.");return qt(),new Promise((s,u)=>{Ft("run",[s,u]);let d=r,c={type:"run",in:{sessionId:t,inputIndices:e,inputs:d,outputIndices:n,options:i}};He.postMessage(c,Mr(d))})}else return Dr(t,e,r,n,o,i)},Yc=async t=>{if(Rt())return qt(),new Promise((e,r)=>{Ft("end-profiling",[e,r]);let n={type:"end-profiling",in:t};He.postMessage(n)});Br(t)}});var Xc,qb,yn,Jc=V(()=>{"use strict";Ve();Uo();J();Cr();to();Xc=(t,e)=>{switch(t.location){case"cpu":return[t.type,t.dims,t.data,"cpu"];case"gpu-buffer":return[t.type,t.dims,{gpuBuffer:t.gpuBuffer},"gpu-buffer"];case"ml-tensor":return[t.type,t.dims,{mlTensor:t.mlTensor},"ml-tensor"];default:throw new Error(`invalid data location: ${t.location} for ${e()}`)}},qb=t=>{switch(t[3]){case"cpu":return new Ke(t[0],t[2],t[1]);case"gpu-buffer":{let e=t[0];if(!Vr(e))throw new Error(`not supported data type: ${e} for deserializing GPU tensor`);let{gpuBuffer:r,download:n,dispose:o}=t[2];return Ke.fromGpuBuffer(r,{dataType:e,dims:t[1],download:n,dispose:o})}case"ml-tensor":{let e=t[0];if(!Lr(e))throw new Error(`not supported data type: ${e} for deserializing MLTensor tensor`);let{mlTensor:r,download:n,dispose:o}=t[2];return Ke.fromMLTensor(r,{dataType:e,dims:t[1],download:n,dispose:o})}default:throw new Error(`invalid data location: ${t[3]}`)}},yn=class{async fetchModelAndCopyToWasmMemory(e){return Kc(await rr(e))}async loadModel(e,r){Ne();let n;typeof e=="string"?n=await this.fetchModelAndCopyToWasmMemory(e):n=e,[this.sessionId,this.inputNames,this.outputNames,this.inputMetadata,this.outputMetadata]=await jc(n,r),Me()}async dispose(){return Zc(this.sessionId)}async run(e,r,n){Ne();let o=[],i=[];Object.entries(e).forEach(g=>{let y=g[0],b=g[1],w=this.inputNames.indexOf(y);if(w===-1)throw new Error(`invalid input '${y}'`);o.push(b),i.push(w)});let s=[],u=[];Object.entries(r).forEach(g=>{let y=g[0],b=g[1],w=this.outputNames.indexOf(y);if(w===-1)throw new Error(`invalid output '${y}'`);s.push(b),u.push(w)});let d=o.map((g,y)=>Xc(g,()=>`input "${this.inputNames[i[y]]}"`)),c=s.map((g,y)=>g?Xc(g,()=>`output "${this.outputNames[u[y]]}"`):null),p=await Qc(this.sessionId,i,d,u,c,n),m={};for(let g=0;g<p.length;g++)m[this.outputNames[u[g]]]=s[g]??qb(p[g]);return Me(),m}startProfiling(){}endProfiling(){Yc(this.sessionId)}}});var tp={};Vt(tp,{OnnxruntimeWebAssemblyBackend:()=>wn,initializeFlags:()=>ep,wasmBackend:()=>Kb});var ep,wn,Kb,rp=V(()=>{"use strict";Ve();Uo();Jc();ep=()=>{(typeof be.wasm.initTimeout!="number"||be.wasm.initTimeout<0)&&(be.wasm.initTimeout=0);let t=be.wasm.simd;if(typeof t!="boolean"&&t!==void 0&&t!=="fixed"&&t!=="relaxed"&&(console.warn(`Property "env.wasm.simd" is set to unknown value "${t}". Reset it to \`false\` and ignore SIMD feature checking.`),be.wasm.simd=!1),typeof be.wasm.proxy!="boolean"&&(be.wasm.proxy=!1),typeof be.wasm.trace!="boolean"&&(be.wasm.trace=!1),typeof be.wasm.numThreads!="number"||!Number.isInteger(be.wasm.numThreads)||be.wasm.numThreads<=0)if(typeof self<"u"&&!self.crossOriginIsolated)be.wasm.numThreads=1;else{let e=typeof navigator>"u"?Wn("node:os").cpus().length:navigator.hardwareConcurrency;be.wasm.numThreads=Math.min(4,Math.ceil((e||1)/2))}},wn=class{async init(e){ep(),await Fc(),await qc(e)}async createInferenceSessionHandler(e,r){let n=new yn;return await n.loadModel(e,r),n}},Kb=new wn});Ve();Ve();Ve();var as="1.24.0-dev.20251227-38355ba07c";var oT=jn;{let t=(rp(),Yt(tp)).wasmBackend;kt("webgpu",t,5),kt("webnn",t,5),kt("cpu",t,10),kt("wasm",t,10)}Object.defineProperty(be.versions,"web",{value:as,enumerable:!0});export{yf as InferenceSession,Tr as TRACE,wt as TRACE_EVENT_BEGIN,_t as TRACE_EVENT_END,Ne as TRACE_FUNC_BEGIN,Me as TRACE_FUNC_END,Ke as Tensor,oT as default,be as env,kt as registerBackend};
/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */
/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */
/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */
//# sourceMappingURL=ort.bundle.min.mjs.map
