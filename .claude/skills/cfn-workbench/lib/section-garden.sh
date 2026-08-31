#!/usr/bin/env bash
# lib/section-garden.sh - garden section for cfn-workbench (Espalier v1).
#
# The run as a growing plant. Every visual channel has a data owner:
#   stem height  = iterations survived        scars on stem = gate cycles done
#   branch       = wave                       leaf/bud      = one lane
#   bud          = pending                    shimmer leaf  = in-flight
#   open leaf    = landed                     thorn         = blocked lane
#   flower       = gate pass                  wilted head   = gate fail
#   droop/desat  = staleness (pill thresholds 120s/600s, client-side classes)
# Roots and soil are background decoration (the only ownerless layer).
#
# Derivation reuses _wb_map_run_state from lib/section-map.sh verbatim: waves,
# per-lane status, spawn ts, names, gate, iteration. No new event types; the
# 9-type set stays closed. All geometry is computed in ONE jq pass emitting
# fixed-arity TSV records; bash interpolates integers and escaped strings only.
#
# Static-completeness: the full plant is plain SVG at render time. A hand-
# written inline WebGL overlay (no library runtime; LYGIA chunks pasted, MIT)
# adds glow at in-flight tips, pollen motes, and an ordered-dither vignette.
# WebGL unavailable -> canvas hides and the SVG stands. prefers-reduced-motion
# -> one static shader frame, no sway. The garden is a reporting artifact and
# is never a gate: section_garden always exits 0.

# _wb_garden_style - scoped CSS. Wilt classes land on the SECTION element
# (client-side timer); transforms target .g-mid so the baked attribute
# transform on the outer <g> (translate+rotate) is never clobbered, and sway
# animation lives on a separate .g-inner wrapper so wilt and sway compose.
_wb_garden_style() {
  cat <<'CSSEOF'
#sec-garden .garden-stage{position:relative;}
#sec-garden .garden-svg{--g-stem:#6b7a4f;--g-leaf:#7ee2a8;--g-bud:#8b93a7;--g-thorn:#c07b4a;--g-scar:#3a3f2e;--g-flower:#e9c46a;--g-soil:#2a2d33;width:100%;height:auto;display:block;}
#sec-garden .g-soil{fill:var(--g-soil);opacity:.55;}
#sec-garden .g-soil-line{stroke:#3a3f4a;stroke-width:2;opacity:.6;}
#sec-garden .g-root{stroke:var(--g-stem);stroke-width:1.5;fill:none;opacity:.15;}
#sec-garden .g-stem{stroke:var(--g-stem);stroke-width:4;fill:none;stroke-linecap:round;}
#sec-garden .g-branch{stroke:var(--g-stem);stroke-width:2.5;fill:none;stroke-linecap:round;opacity:.85;}
#sec-garden .g-scar{fill:var(--g-scar);}
#sec-garden .g-mid{transform-origin:0 0;}
#sec-garden .g-inner{transform-origin:0 0;animation:g-sway 4.5s ease-in-out infinite;}
#sec-garden .g-blade{fill:var(--g-leaf);opacity:.9;}
#sec-garden .g-budshape{fill:var(--g-bud);opacity:.85;}
#sec-garden .g-leaf[data-status="in-flight"] .g-blade{fill:#e5b567;}
#sec-garden .g-shimmer .g-inner{animation:g-sway 4.5s ease-in-out infinite, g-shimmer 1.6s ease-in-out infinite;}
#sec-garden .g-thorn{fill:var(--g-thorn);}
#sec-garden .g-leaf[data-status="blocked"] .g-blade{fill:var(--g-thorn);opacity:.45;}
#sec-garden .g-petal{fill:var(--g-flower);}
#sec-garden .g-core{fill:#fff;opacity:.8;}
#sec-garden .g-wilted-head .g-petal{fill:var(--g-thorn);opacity:.5;}
#sec-garden .g-wilted-head .g-droop{stroke:var(--g-stem);stroke-width:2;fill:none;}
#sec-garden.garden-wilt-warn .g-mid{transform:rotate(7deg);filter:saturate(.55);}
#sec-garden.garden-wilt-bad .g-mid{transform:rotate(15deg);filter:saturate(.25) brightness(.85);}
#sec-garden .garden-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:screen;}
#sec-garden .garden-note{font-size:11px;opacity:.7;font-family:var(--font-mono,monospace);}
@keyframes g-sway{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}
@keyframes g-shimmer{0%,100%{opacity:.45}50%{opacity:1}}
@media (prefers-reduced-motion: reduce){
  #sec-garden .g-inner{animation:none;}
  #sec-garden .g-shimmer .g-inner{animation:none;}
}
CSSEOF
}

# _wb_garden_shader - fragment shader for the overlay. Hand-written WebGL
# plumbing; the utility functions below are adapted LYGIA chunks (MIT,
# https://lygia.xyz): hash, 2D value noise, recursive bayer dither, cosine
# palette. Paste-only, no runtime dependency.
_wb_garden_shader() {
  cat <<'GLSLEOF'
<script type="x-shader/x-fragment" id="garden-shader">
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_hue;
uniform vec2 u_glow[16];
uniform int u_glowN;

/* LYGIA (https://lygia.xyz, MIT), adapted: hash, value noise, bayer dither, cosine palette */
float g_hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float g_noise(vec2 p){
  vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  float a=g_hash(i); float b=g_hash(i+vec2(1.0,0.0));
  float c=g_hash(i+vec2(0.0,1.0)); float d=g_hash(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float g_bayer2(vec2 a){ a=floor(a); return fract(a.x/2.0 + a.y*a.y*0.75); }
float g_dither(vec2 p){ return g_bayer2(0.5*p)*0.25 + g_bayer2(p); }
vec3 g_pal(float t){
  return vec3(0.5) + vec3(0.5)*cos(6.28318*(vec3(1.0,1.0,1.0)*t + vec3(0.0,0.33,0.67)) + u_hue);
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec3 col = vec3(0.0);
  /* pollen: two hash-gridded layers drifting on value noise */
  for(int l=0;l<2;l++){
    float sc = 7.0 + float(l)*5.0;
    vec2 gp = uv*sc;
    vec2 cell = floor(gp);
    float h = g_hash(cell + float(l)*17.0);
    if(h > 0.90){
      vec2 pos = cell + vec2(g_hash(cell+1.0), g_hash(cell+2.0));
      pos.x += 0.12*sin(u_time*0.25 + h*6.28318) + 0.05*g_noise(uv*3.0 + u_time*0.1);
      pos.y -= u_time*(0.02 + 0.02*h);
      pos.y = fract(pos.y);
      float d = length(gp - pos);
      col += g_pal(h)*0.012*smoothstep(0.10, 0.0, d);
    }
  }
  /* glow halos at in-flight leaf tips (pixel coords, top-left origin) */
  for(int i=0;i<16;i++){
    if(i >= u_glowN) break;
    vec2 gp = vec2(u_glow[i].x, u_res.y - u_glow[i].y);
    float d = length(gl_FragCoord.xy - gp);
    float pulse = 0.6 + 0.4*sin(u_time*2.0 + float(i));
    col += g_pal(0.5)*0.05*pulse*smoothstep(90.0, 0.0, d);
  }
  /* vignette + ordered dither (kills banding) */
  col *= smoothstep(1.1, 0.35, length(uv - 0.5));
  col += g_dither(gl_FragCoord.xy)/255.0;
  gl_FragColor = vec4(col, 1.0);
}
</script>
GLSLEOF
}

# _wb_garden_js - overlay plumbing + wilt timer. ~40 lines vanilla WebGL for
# one fullscreen triangle; capability check hides the canvas on failure (the
# SVG plant is the default render, the shader only adds light). 30fps cap;
# prefers-reduced-motion renders ONE static frame. Wilt timer mirrors the
# staleness pill thresholds (120s warn, 600s bad) from data-generated-epoch.
# cfn: epoch sampled per section (same as the pill); unify into a render.sh
# export if a 1s disagreement between pill and garden ever matters.
_wb_garden_js() {
  cat <<'JSEOF'
<script>
(function(){
  var sec = document.getElementById('sec-garden');
  if(!sec) return;
  try {
    var svg = sec.querySelector('.garden-svg');
    var canvas = sec.querySelector('.garden-canvas');
    if(!svg || !canvas) return;
    var gl = canvas.getContext('webgl', {antialias:false, alpha:true});
    if(!gl){ canvas.style.display='none'; return; }
    /* A lost WebGL context presents an uninitialized (white) buffer; under
       mix-blend-mode:screen that white-washes the whole stage over the SVG
       plant. Hide the canvas on loss; the SVG stands on its own. */
    canvas.addEventListener('webglcontextlost', function(ev){
      ev.preventDefault();
      canvas.style.display='none';
    }, false);
    var src = document.getElementById('garden-shader').textContent;
    var vs = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
    function sh(type, s){
      var t = gl.createShader(type);
      gl.shaderSource(t, s); gl.compileShader(t);
      if(!gl.getShaderParameter(t, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(t);
      return t;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, src));
    gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog);
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uRes = gl.getUniformLocation(prog, 'u_res');
    var uTime = gl.getUniformLocation(prog, 'u_time');
    var uHue = gl.getUniformLocation(prog, 'u_hue');
    var uGlow = gl.getUniformLocation(prog, 'u_glow');
    var uGlowN = gl.getUniformLocation(prog, 'u_glowN');
    var vb = (svg.getAttribute('viewBox') || '0 0 640 400').split(' ');
    var vbw = parseFloat(vb[2]) || 640, vbh = parseFloat(vb[3]) || 400;
    /* glow tips: viewBox coords (top-left origin) from data-glow */
    var pts = [];
    var raw = svg.getAttribute('data-glow') || '';
    if(raw){
      var pairs = raw.split(';');
      for(var i = 0; i < pairs.length && pts.length < 32; i++){
        var xy = pairs[i].split(',');
        if(xy.length === 2){
          var gx = parseFloat(xy[0]), gy = parseFloat(xy[1]);
          if(isFinite(gx) && isFinite(gy)){ pts.push(gx); pts.push(gy); }
        }
      }
    }
    /* deterministic per-run hue from the slug */
    var slug = svg.getAttribute('data-run') || '';
    var hsh = 0;
    for(var c = 0; c < slug.length; c++){ hsh = (hsh*31 + slug.charCodeAt(c)) >>> 0; }
    var hue = (hsh % 1000) / 1000;
    var reduced = false;
    try { reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){}
    function frame(t){
      /* belt for loss between frames: stop drawing, hide, SVG stands */
      if(gl.isContextLost()){ canvas.style.display='none'; return; }
      var w = Math.max(1, Math.floor(svg.clientWidth));
      var h = Math.max(1, Math.floor(svg.clientHeight));
      if(canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      var s = Math.min(w/vbw, h/vbh), ox = (w - vbw*s)/2, oy = (h - vbh*s)/2;
      var g = [];
      for(var i = 0; i < pts.length; i += 2){
        g.push(pts[i]*s + ox); g.push(pts[i+1]*s + oy);
      }
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uTime, (t || 0)/1000);
      gl.uniform1f(uHue, hue);
      gl.uniform1i(uGlowN, g.length/2);
      if(g.length){ gl.uniform2fv(uGlow, g); }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if(reduced){ frame(0); }
    else {
      var FPMS = 1000/30, last = -1e9;
      var raf = function(t){
        if(t - last >= FPMS - 1){ last = t; frame(t); }
        window.requestAnimationFrame(raf);
      };
      window.requestAnimationFrame(raf);
    }
  } catch(e) {
    var cv = sec.querySelector('.garden-canvas');
    if(cv) cv.style.display = 'none';
  }
  /* wilt: staleness classes on the section, pill thresholds */
  try {
    var e0 = parseInt(sec.getAttribute('data-generated-epoch') || '0', 10);
    if(e0){
      var tick = function(){
        var age = (Date.now()/1000) - e0;
        sec.classList.toggle('garden-wilt-warn', age >= 120 && age < 600);
        sec.classList.toggle('garden-wilt-bad', age >= 600);
      };
      tick(); setInterval(tick, 30000);
    }
  } catch(e2){}
})();
</script>
JSEOF
}

# _wb_garden_empty EPOCH - empty-state card (run plan missing or unreadable).
_wb_garden_empty() {
  local epoch="$1" msg="${2:-no run plan yet}"
  printf '<section class="card" id="sec-garden" data-generated-epoch="%s">\n' "$epoch"
  printf '<span class="section-kicker">Garden</span>\n'
  printf '<h2>The run as a growing plant</h2>\n'
  printf '<p class="empty">%s</p>\n' "$msg"
  printf '</section>\n'
  return 0
}

# section_garden - emit the garden section. Always exits 0 (never a gate).
section_garden() {
  local slug="${WORKBENCH_SLUG:-}"
  local root="${WORKBENCH_ROOT:-.}"
  local run_plan; run_plan="$(plan_path "$root" "$slug" "run-plan-${slug}.json")" || true
  local epoch; epoch="$(date -u +%s)"

  if [[ -z "$run_plan" || ! -f "$run_plan" ]]; then
    record_gap "garden section (no run plan for ${slug})"
    _wb_garden_empty "$epoch"
    return 0
  fi

  local state
  state="$(_wb_map_run_state "$slug" "$root" "$run_plan")" \
    || { record_gap "garden section (state derivation failed for ${slug})"; _wb_garden_empty "$epoch"; return 0; }

  # One jq pass: all geometry as fixed-arity TSV records.
  # hdr vw vh x0 soil stemH | scar x y | branch k dir x0 ay tx ty n
  # leaf lane status name k j x y ang | (gate read from state JSON in bash)
  local geo
  geo="$(printf '%s' "$state" | jq -r '
    . as $rs
    | ($rs.waves | length) as $W
    | ($rs.iteration // 1) as $it
    | (if $it > 4 then 4 else $it end) as $itc
    | (120 + 90*$itc) as $stemH
    | (40 + $stemH + 40) as $vh
    | 640 as $vw
    | 320 as $x0
    | ($vh - 40) as $soil
    | ($rs.waves | to_entries
        | map(.key as $k | .value as $lanes
              | ($lanes | length) as $n
              | ([70 + 18*$n, 160] | min) as $L
              | (($L * 0.906) | floor) as $Lx
              | (($L * 0.423) | floor) as $Ly
              | (if ($k % 2) == 0 then 1 else -1 end) as $dir
              | {k: $k, n: $n, L: $L, Lx: $Lx, Ly: $Ly, dir: $dir,
                 ay: ($soil - (($stemH * ($k + 1) / ($W + 1)) | floor))})) as $B
    | ( [ "hdr", $vw, $vh, $x0, $soil, $stemH, $it ] | @tsv ),
      ( range(0; ($it - 1))
        | [ "scar", $x0, ($soil - (($stemH * (. + 1) / $it) | floor)) ] | @tsv ),
      ( $rs.waves | to_entries[]
        | .key as $k | .value as $lanes
        | ($lanes | length) as $n
        | $B[$k] as $b
        | [ "branch", $k, $b.dir, $x0, $b.ay,
            ($x0 + $b.dir * $b.Lx), ($b.ay - $b.Ly), $n ] | @tsv ),
      ( $rs.waves | to_entries[]
        | .key as $k | .value as $lanes
        | ($lanes | length) as $n
        | $B[$k] as $b
        | ($b.Lx / ($n + 1)) as $ux
        | ($b.Ly / ($n + 1)) as $uy
        | ($lanes | to_entries[]
            | .key as $j | .value as $lane
            | ($rs.status[$lane] // "pending") as $sv
            | (($rs.names[$lane] // "") | if . == "" then $lane else . end) as $nm
            | (if $b.dir == 1 then -25 else -155 end
               + ((($j * 7 + $k * 13) % 11) - 5)) as $ang
            | [ "leaf", $lane, $sv, $nm, $k, $j,
                ($x0 + $b.dir * (($ux * ($j + 1)) | floor)),
                ($b.ay - (($uy * ($j + 1)) | floor)),
                $ang ] | @tsv ) )
    ' 2>/dev/null)" || geo=""

  if [[ -z "$geo" ]]; then
    record_gap "garden section (layout computation failed for ${slug})"
    printf '<section class="card" id="sec-garden" data-generated-epoch="%s">\n' "$epoch"
    printf '<span class="section-kicker">Garden</span>\n'
    printf '<h2>The run as a growing plant</h2>\n'
    printf '<p class="empty">garden layout unavailable</p>\n'
    printf '</section>\n'
    return 0
  fi

  local vw vh x0 soil stemh it
  local scars_html="" branches_html="" leaves_html="" roots_html=""
  local glow="" lane st nm k j lx ly ang delay d
  while IFS=$'\t' read -r tag a b c d e f g_h h_i; do
    case "$tag" in
      hdr) vw="$a"; vh="$b"; x0="$c"; soil="$d"; stemh="$e"; it="$f" ;;
      scar)
        scars_html+=$(printf '<circle class="g-scar" cx="%s" cy="%s" r="4"><title>gate cycle</title></circle>' "$a" "$b")
        ;;
      branch)
        # a=k b=dir c=x0 d=ay e=tx f=ty g_h=n ; tip curve control midpoint lift
        branches_html+=$(printf '<path class="g-branch" d="M %s %s Q %s %s %s %s"><title>wave %s</title></path>' \
          "$c" "$d" "$(( (c + e) / 2 + b * 6 ))" "$(( (d + f) / 2 - 8 ))" "$e" "$f" "$((a + 1))")
        ;;
      leaf)
        # a=lane b=status c=name d=k e=j f=x g_h=y h_i=ang
        lane="$a"; st="$b"; nm="$c"; k="$d"; j="$e"; lx="$f"; ly="$g_h"; ang="$h_i"
        local shape="" mod=""
        case "$st" in
          pending) mod="g-bud"
                   shape=$(printf '<ellipse class="g-budshape" cx="0" cy="-6" rx="4" ry="7"/>') ;;
          in-flight) mod="g-shimmer"
                   shape=$(printf '<path class="g-blade" d="M 0 0 q 8 -7 17 -1 q -8 7 -17 1 z"/>') ;;
          landed) mod="g-open"
                  shape=$(printf '<path class="g-blade" d="M 0 0 q 8 -7 17 -1 q -8 7 -17 1 z"/>') ;;
          blocked) mod="g-blocked"
                   shape=$(printf '<path class="g-thorn" d="M 0 0 l 3 -9 l 4 8 z"/><path class="g-blade" d="M 0 0 q 5 -4 10 0 q -5 5 -10 0 z"/>') ;;
          *) mod="g-bud"
             shape=$(printf '<ellipse class="g-budshape" cx="0" cy="-6" rx="4" ry="7"/>') ;;
        esac
        d=$(( (j * 7 + k * 3) % 10 ))
        delay="-1.${d}s"
        leaves_html+=$(printf '<g class="g-leaf %s" data-lane="%s" data-status="%s" transform="translate(%s %s) rotate(%s)"><g class="g-mid"><g class="g-inner" style="animation-delay:%s">%s<title>%s: %s</title></g></g></g>' \
          "$mod" "$(html_escape "$lane")" "$st" "$lx" "$ly" "$ang" "$delay" "$shape" "$(html_escape "$nm")" "$st")
        if [[ "$st" == "in-flight" ]]; then
          glow+="${lx},${ly};"
        fi
        ;;
      *) ;; # unknown record: skip (never fail)
    esac
  done <<< "$geo"

  # Stem: wobbled polyline, one segment per iteration survived.
  local stem_d="M ${x0} ${soil}" i wx wy
  for (( i = 1; i <= it; i++ )); do
    wx=$(( x0 + ((i * 17) % 9) - 4 ))
    wy=$(( soil - stemh * i / it ))
    stem_d+=" L ${wx} ${wy}"
  done
  local apex_x="$wx" apex_y="$wy"

  # Roots: faint decoration below the soil line.
  roots_html+=$(printf '<path class="g-root" d="M %s %s C %s %s %s %s %s %s"/>' \
    "$x0" "$soil" "$((x0-30))" "$((soil+10))" "$((x0-55))" "$((soil+18))" "$((x0-72))" "$((soil+26))")
  roots_html+=$(printf '<path class="g-root" d="M %s %s C %s %s %s %s %s %s"/>' \
    "$x0" "$soil" "$((x0+26))" "$((soil+12))" "$((x0+48))" "$((soil+20))" "$((x0+66))" "$((soil+26))")
  roots_html+=$(printf '<path class="g-root" d="M %s %s L %s %s"/>' \
    "$x0" "$soil" "$x0" "$((soil+24))")

  # Gate head at the apex: pass blooms, fail wilts, unknown stays bare.
  local gate_kind head_html=""
  gate_kind="$(printf '%s' "$state" | jq -r '.gate // "unknown"')"
  case "$gate_kind" in
    pass)
      head_html='<g class="g-flower" transform="translate('"${apex_x} ${apex_y}"')">'
      local p
      for p in 0 60 120 180 240 300; do
        head_html+=$(printf '<ellipse class="g-petal" cx="0" cy="-9" rx="4" ry="10" transform="rotate(%s)"/>' "$p")
      done
      head_html+='<circle class="g-core" r="4"><title>gate pass</title></circle></g>'
      ;;
    fail)
      head_html='<g class="g-wilted-head" transform="translate('"${apex_x} ${apex_y}"')">'
      head_html+=$(printf '<path class="g-droop" d="M 0 0 q 6 10 4 20"/>')
      local p
      for p in 40 80 140 220; do
        head_html+=$(printf '<ellipse class="g-petal" cx="0" cy="-7" rx="3" ry="8" transform="rotate(%s)" opacity="0.5"/>' "$((p + 90))")
      done
      head_html+='<title>gate fail: run iterates</title></g>'
      ;;
    *) head_html="" ;;
  esac

  glow="${glow%;}"

  printf '<section class="card" id="sec-garden" data-generated-epoch="%s">\n' "$epoch"
  printf '<span class="section-kicker">Garden</span>\n'
  printf '<h2>The run as a growing plant</h2>\n'
  printf '<style>\n%s\n</style>\n' "$(_wb_garden_style)"
  printf '<div class="garden-stage">\n'
  printf '<svg class="garden-svg" viewBox="0 0 %s %s" data-run="%s" data-glow="%s" role="img" aria-label="Garden view of run %s">' \
    "$vw" "$vh" "$(html_escape "$slug")" "$glow" "$(html_escape "$slug")"
  printf '<rect class="g-soil" x="0" y="%s" width="%s" height="40"/>' "$soil" "$vw"
  printf '<line class="g-soil-line" x1="0" y1="%s" x2="%s" y2="%s"/>' "$soil" "$vw" "$soil"
  printf '%s' "$roots_html"
  printf '<path class="g-stem" d="%s"/>' "$stem_d"
  printf '%s' "$scars_html"
  printf '%s' "$branches_html"
  printf '%s' "$leaves_html"
  printf '%s' "$head_html"
  printf '</svg>\n'
  printf '<canvas class="garden-canvas"></canvas>\n'
  printf '</div>\n'
  printf '%s\n' "$(_wb_garden_shader)"
  printf '%s\n' "$(_wb_garden_js)"
  printf '<p class="garden-note">bud = pending, shimmer = in flight, open leaf = landed, thorn = blocked; scars = gate cycles; flower = pass, wilted head = fail; droop = stale data</p>\n'
  printf '</section>\n'
  return 0
}
