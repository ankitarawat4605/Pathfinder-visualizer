// --------- State & Utils ---------
const state = {
  rows: 20, cols: 40,
  start: { r: 2, c: 2 },
  end:   { r: 17, c: 35 },
  walls: new Set(),     
  weights: new Set(),   
  mode: 'wall',      
  running: false,
  themeLight: false,
};

const $ = id => document.getElementById(id);
const boardEl = $("board");
function key(r,c){ return `${r},${c}`; }

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

// --------- Grid Rendering ---------
function setGrid(rows, cols){
  state.rows = rows; state.cols = cols;
  boardEl.style.setProperty('--cols', cols);
  boardEl.innerHTML = "";
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r; cell.dataset.c = c;
      boardEl.appendChild(cell);
    }
  }
  paintAll();
  attachCellEvents();
}

function paintAll(){
  document.querySelectorAll('.cell').forEach(cell=>{
    const r = +cell.dataset.r, c = +cell.dataset.c;
    cell.className = 'cell';
    const k = key(r,c);
    if(state.walls.has(k)) cell.classList.add('wall');
    if(state.weights.has(k)) cell.classList.add('weight');
    if(r===state.start.r && c===state.start.c) cell.classList.add('start');
    if(r===state.end.r && c===state.end.c) cell.classList.add('end');
  });
  $("nodes").textContent = 0;
  $("plen").textContent = 0;
  $("time").textContent = "0 ms";
  $("complexity").textContent = "—";
}

function clearVisited(){
  document.querySelectorAll('.cell').forEach(cell=>{
    cell.classList.remove('visited','path');
  });
  $("nodes").textContent = 0;
  $("plen").textContent = 0;
  $("time").textContent = "0 ms";
}

function resetAll(){
  state.walls.clear();
  state.weights.clear();
  clearVisited();
  paintAll();
}

// --------- Interaction ---------
let isMouseDown = false;
window.addEventListener('mousedown', ()=> isMouseDown = true);
window.addEventListener('mouseup', ()=> isMouseDown = false);

function setMode(m){
  state.mode = m;
  ["mode-start","mode-end","mode-wall","mode-erase"].forEach(id=>$(id).style.outline = "");
  $("mode-"+m).style.outline = "2px solid var(--accent)";
}

function attachCellEvents(){
  document.querySelectorAll('.cell').forEach(cell=>{
    cell.onmousedown = cell.onmouseenter = (e)=>{
      if(!isMouseDown && e.type==='mouseenter') return;
      if(state.running) return;
      const r = +cell.dataset.r, c = +cell.dataset.c;
      const k = key(r,c);
      const shift = e.shiftKey, alt = e.altKey;

      if(state.mode==='start'){
        if(state.walls.has(k) || (r===state.end.r && c===state.end.c)) return;
        state.start = { r, c }; paintAll();
      } else if(state.mode==='end'){
        if(state.walls.has(k) || (r===state.start.r && c===state.start.c)) return;
        state.end = { r, c }; paintAll();
      } else if(state.mode==='wall'){
        if((r===state.start.r && c===state.start.c) || (r===state.end.r && c===state.end.c)) return;
        if(shift){ // add weight instead of wall
          state.weights.add(k); cell.classList.add('weight'); state.walls.delete(k); cell.classList.remove('wall');
        } else if(alt){ // remove weight
          state.weights.delete(k); cell.classList.remove('weight');
        } else {
          state.walls.add(k); cell.classList.add('wall'); state.weights.delete(k); cell.classList.remove('weight');
        }
      } else if(state.mode==='erase'){
        state.walls.delete(k); state.weights.delete(k); cell.classList.remove('wall','weight');
      }
    };
  });
}

// --------- Neighbors & Costs ---------
function neighbors(r,c){
  const out=[]; const dirs=[[1,0],[-1,0],[0,1],[0,-1]]; // 4-directional
  for(const [dr,dc] of dirs){
    const nr=r+dr, nc=c+dc;
    if(nr>=0 && nr<state.rows && nc>=0 && nc<state.cols && !state.walls.has(key(nr,nc))) out.push([nr,nc]);
  }
  return out;
}
function costAt(r,c){
  return state.weights.has(key(r,c)) ? 5 : 1;
}

// --------- Priority Queue (Min-Heap) ---------
class MinHeap{
  constructor(){ this.a=[]; }
  push(x){ this.a.push(x); this._up(this.a.length-1); }
  _up(i){ while(i>0){ const p=(i-1)>>1; if(this.a[p][0] <= this.a[i][0]) break; [this.a[p],this.a[i]]=[this.a[i],this.a[p]]; i=p; } }
  pop(){ if(this.a.length===0) return null; const top=this.a[0]; const last=this.a.pop(); if(this.a.length){ this.a[0]=last; this._down(0); } return top; }
  _down(i){ const n=this.a.length; while(true){ let l=i*2+1, r=i*2+2, m=i; if(l<n && this.a[l][0]<this.a[m][0]) m=l; if(r<n && this.a[r][0]<this.a[m][0]) m=r; if(m===i) break; [this.a[i],this.a[m]]=[this.a[m],this.a[i]]; i=m; } }
  get size(){ return this.a.length; }
}

// --------- Algorithms ---------
async function bfs(start, end){
  const t0 = performance.now();
  const q = [[...start]];
  const seen = new Set([key(start[0], start[1])]);
  const prev = new Map();
  const delay = 105 - +$("speed").value;
  let visited = 0;

  while(q.length){
    const [r,c] = q.shift();
    const cell = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    if(!(r===state.start.r && c===state.start.c) && !(r===state.end.r && c===state.end.c)){
      cell.classList.add('visited'); visited++;
      if(delay>0) await new Promise(res=>setTimeout(res, delay));
    }
    if(r===end[0] && c===end[1]){
      const t1 = performance.now();
      $("nodes").textContent = visited;
      $("complexity").textContent = "BFS ≈ O(V + E)";
      const path = reconstruct(prev, start, end);
      await drawPath(path, delay);
      $("plen").textContent = path.length ? path.length-1 : 0;
      $("time").textContent = Math.round(t1 - t0) + " ms";
      return;
    }
    for(const [nr,nc] of neighbors(r,c)){
      const k = key(nr,nc);
      if(!seen.has(k)){
        seen.add(k);
        prev.set(k, [r,c]);
        q.push([nr,nc]);
      }
    }
  }
  const t1 = performance.now();
  $("nodes").textContent = visited;
  $("complexity").textContent = "BFS ≈ O(V + E)";
  $("time").textContent = Math.round(t1 - t0) + " ms";
}

async function dfs(start, end){
  const t0 = performance.now();
  const stack = [[...start]];
  const seen = new Set([key(start[0], start[1])]);
  const prev = new Map();
  const delay = 105 - +$("speed").value;
  let visited = 0;

  while(stack.length){
    const [r,c] = stack.pop();
    const cell = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    if(!(r===state.start.r && c===state.start.c) && !(r===state.end.r && c===state.end.c)){
      cell.classList.add('visited'); visited++;
      if(delay>0) await new Promise(res=>setTimeout(res, delay));
    }
    if(r===end[0] && c===end[1]){
      const t1 = performance.now();
      $("nodes").textContent = visited;
      $("complexity").textContent = "DFS ≈ O(V + E)";
      const path = reconstruct(prev, start, end);
      await drawPath(path, delay);
      $("plen").textContent = path.length ? path.length-1 : 0; // not guaranteed shortest
      $("time").textContent = Math.round(t1 - t0) + " ms";
      return;
    }
    for(const [nr,nc] of neighbors(r,c)){
      const k = key(nr,nc);
      if(!seen.has(k)){
        seen.add(k);
        prev.set(k, [r,c]);
        stack.push([nr,nc]);
      }
    }
  }
  const t1 = performance.now();
  $("nodes").textContent = visited;
  $("complexity").textContent = "DFS ≈ O(V + E)";
  $("time").textContent = Math.round(t1 - t0) + " ms";
}

async function dijkstra(start, end){
  const t0 = performance.now();
  const dist = new Map();
  const prev = new Map();
  const heap = new MinHeap();
  const delay = 105 - +$("speed").value;
  let visited = 0;

  const startK = key(start[0], start[1]);
  dist.set(startK, 0);
  heap.push([0, start]);

  const seen = new Set();

  while(heap.size){
    const [d, [r,c]] = heap.pop();
    const k = key(r,c);
    if(seen.has(k)) continue;
    seen.add(k);

    const cell = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    if(!(r===state.start.r && c===state.start.c) && !(r===state.end.r && c===state.end.c)){
      cell.classList.add('visited'); visited++;
      if(delay>0) await new Promise(res=>setTimeout(res, delay));
    }
    if(r===end[0] && c===end[1]){
      const t1 = performance.now();
      $("nodes").textContent = visited;
      $("complexity").textContent = "Dijkstra ≈ O(E log V)";
      const path = reconstruct(prev, start, end);
      await drawPath(path, delay);
      $("plen").textContent = path.length ? path.length-1 : 0;
      $("time").textContent = Math.round(t1 - t0) + " ms";
      return;
    }
    for(const [nr,nc] of neighbors(r,c)){
      const nk = key(nr,nc);
      const w = costAt(nr,nc);
      const nd = d + w;
      if(!dist.has(nk) || nd < dist.get(nk)){
        dist.set(nk, nd);
        prev.set(nk, [r,c]);
        heap.push([nd, [nr,nc]]);
      }
    }
  }
  const t1 = performance.now();
  $("nodes").textContent = visited;
  $("complexity").textContent = "Dijkstra ≈ O(E log V)";
  $("time").textContent = Math.round(t1 - t0) + " ms";
}

function manhattan(a,b){ return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]); }

async function aStar(start, end){
  const t0 = performance.now();
  const g = new Map(); // cost from start
  const prev = new Map();
  const heap = new MinHeap();
  const delay = 105 - +$("speed").value;
  let visited = 0;

  const sk = key(start[0], start[1]);
  g.set(sk, 0);
  heap.push([manhattan(start,end), start]);
  const seen = new Set();

  while(heap.size){
    const [f, [r,c]] = heap.pop();
    const k = key(r,c);
    if(seen.has(k)) continue;
    seen.add(k);

    const cell = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    if(!(r===state.start.r && c===state.start.c) && !(r===state.end.r && c===state.end.c)){
      cell.classList.add('visited'); visited++;
      if(delay>0) await new Promise(res=>setTimeout(res, delay));
    }
    if(r===end[0] && c===end[1]){
      const t1 = performance.now();
      $("nodes").textContent = visited;
      $("complexity").textContent = "A* ≈ O(E log V) with heuristic";
      const path = reconstruct(prev, start, end);
      await drawPath(path, delay);
      $("plen").textContent = path.length ? path.length-1 : 0;
      $("time").textContent = Math.round(t1 - t0) + " ms";
      return;
    }
    for(const [nr,nc] of neighbors(r,c)){
      const nk = key(nr,nc);
      const w = costAt(nr,nc);
      const tentative = g.get(k) + w;
      if(!g.has(nk) || tentative < g.get(nk)){
        g.set(nk, tentative);
        prev.set(nk, [r,c]);
        const h = manhattan([nr,nc], end);
        heap.push([tentative + h, [nr,nc]]);
      }
    }
  }
  const t1 = performance.now();
  $("nodes").textContent = visited;
  $("complexity").textContent = "A* ≈ O(E log V) with heuristic";
  $("time").textContent = Math.round(t1 - t0) + " ms";
}

// --------- Path Reconstruction & Drawing ---------
function reconstruct(prev, start, end){
  const path = [];
  let cur = end;
  const sk = key(start[0], start[1]);
  while(cur && key(cur[0],cur[1]) !== sk){
    path.push(cur);
    cur = prev.get(key(cur[0],cur[1]));
  }
  if(cur) path.push(start);
  path.reverse();
  return path;
}
async function drawPath(path, delay){
  for(const [r,c] of path){
    if((r===state.start.r && c===state.start.c) || (r===state.end.r && c===state.end.c)) continue;
    const cell = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    cell.classList.remove('visited');
    cell.classList.add('path');
    if(delay>0) await new Promise(res=>setTimeout(res, Math.max(10, delay-10)));
  }
}

// --------- Maze Generation (Random Walls) ---------
function generateMaze(){
  resetAll();
  // simple random fill with bias
  const density = 0.28;
  for(let r=0;r<state.rows;r++){
    for(let c=0;c<state.cols;c++){
      const k = key(r,c);
      if((r===state.start.r && c===state.start.c) || (r===state.end.r && c===state.end.c)) continue;
      if(Math.random() < density){
        state.walls.add(k);
      } else if(Math.random() < 0.10){
        state.weights.add(k);
      }
    }
  }
  paintAll();
}

// --------- Bootstrap & Events ---------
function init(){
  setGrid(state.rows, state.cols);
  setMode('wall');

  $("run").onclick = async ()=>{
    if(state.running) return;
    state.running = true; clearVisited();
    const algo = $("algo").value;
    const start = [state.start.r, state.start.c];
    const end = [state.end.r, state.end.c];
    try{
      if(algo==='bfs') await bfs(start, end);
      else if(algo==='dfs') await dfs(start, end);
      else if(algo==='dijkstra') await dijkstra(start, end);
      else if(algo==='astar') await aStar(start, end);
    } finally { state.running = false; }
  };

  $("clearVisited").onclick = ()=>{ if(!state.running) clearVisited(); };
  $("reset").onclick = ()=>{ if(!state.running) resetAll(); };
  $("maze").onclick = ()=>{ if(!state.running) generateMaze(); };

  $("resize").onclick = ()=>{
    if(state.running) return;
    const r = clamp(+$("rows").value||20, 5, 60);
    const c = clamp(+$("cols").value||40, 10, 80);
    $("rows").value = r; $("cols").value = c;
    state.start = { r: Math.min(2, r-1), c: Math.min(2, c-1) };
    state.end = { r: r-3, c: c-3 };
    state.walls.clear(); state.weights.clear();
    setGrid(r,c);
  };

  $("mode-start").onclick = ()=> setMode('start');
  $("mode-end").onclick = ()=> setMode('end');
  $("mode-wall").onclick = ()=> setMode('wall');
  $("mode-erase").onclick = ()=> setMode('erase');

  $("theme").onclick = ()=>{
    state.themeLight = !state.themeLight;
    document.documentElement.classList.toggle('light', state.themeLight);
  };
}

init();
