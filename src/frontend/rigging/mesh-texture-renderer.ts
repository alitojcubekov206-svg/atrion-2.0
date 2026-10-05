export type TexturedMesh = {uv:[number,number][];vertices:[number,number][];triangles:[number,number,number][]};

const vertexSource = `
attribute vec2 position;
attribute vec2 uv;
uniform mat3 transform;
uniform vec2 viewport;
varying vec2 textureUV;
void main() {
  vec2 pixel = (transform * vec3(position, 1.0)).xy;
  gl_Position = vec4(pixel.x / viewport.x * 2.0 - 1.0, 1.0 - pixel.y / viewport.y * 2.0, 0.0, 1.0);
  textureUV = uv;
}`;
const fragmentSource = `
precision mediump float;
uniform sampler2D textureImage;
varying vec2 textureUV;
void main() { gl_FragColor = texture2D(textureImage, textureUV); }
`;

/** One indexed draw shares rasterized edges, without per-triangle Canvas clip antialiasing. */
export class MeshTextureRenderer {
  private canvas = document.createElement("canvas");
  private gl:WebGLRenderingContext|null;
  private program:WebGLProgram|null = null;
  private vertices:WebGLBuffer|null = null;
  private indices:WebGLBuffer|null = null;
  private position = -1;
  private uv = -1;
  private transform:WebGLUniformLocation|null = null;
  private viewport:WebGLUniformLocation|null = null;
  private textures = new Map<HTMLImageElement,WebGLTexture>();
  private rejected = new WeakSet<HTMLImageElement>();

  constructor() {
    this.gl = this.canvas.getContext("webgl",{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:false});
    this.canvas.addEventListener("webglcontextlost",e=>{e.preventDefault();});
    this.canvas.addEventListener("webglcontextrestored",()=>{this.textures.clear();this.rejected=new WeakSet();this.initialize();});
    this.initialize();
  }

  private initialize() {
    const gl=this.gl;if(!gl)return;
    const shaders:WebGLShader[]=[];
    const compile=(kind:number,source:string)=>{
      const shader=gl.createShader(kind);if(!shader)return null;
      shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
      return gl.getShaderParameter(shader,gl.COMPILE_STATUS)?shader:null;
    };
    const vertex=compile(gl.VERTEX_SHADER,vertexSource),fragment=compile(gl.FRAGMENT_SHADER,fragmentSource);
    const program=gl.createProgram();
    if(program&&vertex&&fragment){gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);}
    for(const shader of shaders)gl.deleteShader(shader);
    if(!program||!vertex||!fragment||!gl.getProgramParameter(program,gl.LINK_STATUS)){if(program)gl.deleteProgram(program);this.program=null;return;}
    this.program=program;this.vertices=gl.createBuffer();this.indices=gl.createBuffer();
    this.position=gl.getAttribLocation(program,"position");this.uv=gl.getAttribLocation(program,"uv");
    this.transform=gl.getUniformLocation(program,"transform");this.viewport=gl.getUniformLocation(program,"viewport");
    gl.useProgram(program);gl.uniform1i(gl.getUniformLocation(program,"textureImage"),0);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.clearColor(0,0,0,0);
  }

  draw(ctx:CanvasRenderingContext2D,image:HTMLImageElement,width:number,height:number,mesh:TexturedMesh):boolean {
    const gl=this.gl;
    if(!gl||!this.program||!this.vertices||!this.indices||gl.isContextLost()||this.rejected.has(image))return false;
    let texture=this.textures.get(image);
    if(!texture){
      const next=gl.createTexture();if(!next)return false;
      gl.bindTexture(gl.TEXTURE_2D,next);
      try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);}
      catch{gl.deleteTexture(next);this.rejected.add(image);return false;}
      if(gl.getError()!==gl.NO_ERROR){gl.deleteTexture(next);this.rejected.add(image);return false;}
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      this.textures.set(image,next);texture=next;
      // Bound the cache even when the editor repeatedly imports new documents.
      if(this.textures.size>32){const oldest=this.textures.entries().next().value!;gl.deleteTexture(oldest[1]);this.textures.delete(oldest[0]);}
    }
    if(this.canvas.width!==ctx.canvas.width)this.canvas.width=ctx.canvas.width;
    if(this.canvas.height!==ctx.canvas.height)this.canvas.height=ctx.canvas.height;
    gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    const data=new Float32Array(mesh.vertices.length*4);
    for(let i=0;i<mesh.vertices.length;i++)data.set([mesh.vertices[i][0],mesh.vertices[i][1],mesh.uv[i][0]/width,1-mesh.uv[i][1]/height],i*4);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.vertices);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.position);gl.vertexAttribPointer(this.position,2,gl.FLOAT,false,16,0);
    gl.enableVertexAttribArray(this.uv);gl.vertexAttribPointer(this.uv,2,gl.FLOAT,false,16,8);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indices);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(mesh.triangles.flat()),gl.DYNAMIC_DRAW);
    const m=ctx.getTransform();gl.uniformMatrix3fv(this.transform,false,[m.a,m.b,0,m.c,m.d,0,m.e,m.f,1]);
    gl.uniform2f(this.viewport,this.canvas.width,this.canvas.height);
    gl.drawElements(gl.TRIANGLES,mesh.triangles.length*3,gl.UNSIGNED_SHORT,0);
    // Copy in the same task before the browser clears the non-preserved drawing buffer.
    ctx.save();ctx.resetTransform();ctx.drawImage(this.canvas,0,0);ctx.restore();
    return true;
  }

  dispose() {
    const gl=this.gl;if(!gl)return;
    for(const texture of this.textures.values())gl.deleteTexture(texture);
    this.textures.clear();gl.deleteBuffer(this.vertices);gl.deleteBuffer(this.indices);gl.deleteProgram(this.program);
    this.program=null;gl.getExtension("WEBGL_lose_context")?.loseContext();this.gl=null;
  }
}
