// Created by Tigran Zhamakochyan

// Where are parrots most at risk? A choropleth of parrot species by
// biogeographic realm, with a linked detail panel and ranking chart.

// Dependencies
// d3 v7, loaded globally before this file (the site already loads it)
// visualizations/visualization4.css
// data/parrots.json, data/realms.geojson

// Usage
// <div id="parrot-conservation-viz" data-path="data/"></div>
// The component starts automatically when that element exists.
// `data-path` is optional (default "data/") and is the folder holding both data files.
// It can also be started by hand:
// ParrotConservationViz.init("#parrot-conservation-viz", { dataPath: "data/" });
// The root element must keep the id "parrot-conservation-viz", because all CSS is scoped to it.

(function () {
  "use strict";

  const ROOT_ID = "parrot-conservation-viz";

  const REALM_NAMES = {
    L: "Neotropical", N: "Nearctic", F: "Afrotropical", M: "Madagascar & islands", P: "Palearctic",
    I: "Indomalayan", W: "Wallacea", A: "Australian", O: "Oceania", Z: "New Zealand & islands",
  };
  const SHORT_NAMES = { ...REALM_NAMES, M: "Madagascar & isl.", Z: "New Zealand & isl." };
  // Were each realm's value label sits [lon, lat]
  const LABEL_AT = { L: [-60, -12], N: [-100, 48], F: [20, 2], M: [47, -20], P: [85, 52], I: [80, 20],
                     W: [123, -2], A: [134, -25], O: [-160, -14], Z: [172, -42] };
  // Small islands that vanish at world scale; drawn as dots in their realm's color
  const ISLANDS = [
    ["O", -172.1, -13.8, "Samoa"], ["O", -149.4, -17.6, "Society Is."], ["O", 158.2, 6.9, "Pohnpei"],
    ["O", -128.3, -24.4, "Henderson I."], ["O", -152.8, -22.6, "Rimatara"], ["O", -175.2, -21.1, "Tonga"],
    ["O", -139.5, -9.0, "Marquesas"], ["O", -159.8, -21.2, "Cook Is."],
    ["M", 57.6, -20.3, "Mauritius"], ["M", 55.5, -21.1, "Réunion"], ["M", 55.5, -4.6, "Seychelles"],
    ["M", 43.3, -11.7, "Comoros"], ["M", 63.4, -19.7, "Rodrigues"],
  ];
  const THREATENED = new Set(["VU", "EN", "CR", "CR (PE)", "CR (PEW)"]);
  const EXTINCT = new Set(["EX", "EW", "CR (PE)", "CR (PEW)"]);
  const ASSESSED = new Set(["LC", "NT", "VU", "EN", "CR", "CR (PE)", "CR (PEW)"]);
  const IUCN = [ // [code, label, color]: IUCN Red List hues, softened slightly
    ["EX", "Extinct", "#2b2a28"], ["EW", "Extinct in the wild", "#6b3a5c"], ["CR", "Critically endangered", "#c8362b"],
    ["EN", "Endangered", "#e7793a"], ["VU", "Vulnerable", "#e8c13a"], ["NT", "Near threatened", "#a8c255"],
    ["LC", "Least concern", "#5a9f68"], ["DD", "Data deficient / not assessed", "#c4c0b6"],
  ];
  const STATUS_NOTE = { "CR (PE)": "possibly extinct", "CR (PEW)": "possibly extinct in the wild" };
  const iucnKey = s => !s ? "DD" : s.startsWith("CR") ? "CR" : s;
  const iucnOf = s => IUCN.find(i => i[0] === iucnKey(s)) || IUCN[IUCN.length - 1];
  const MIN_N = 3;

  // Perceptually ordered sequential ramps (light -> dark), interpolated in Lab
  const ramp = stops => d3.piecewise(d3.interpolateLab, stops);
  const RISK = ramp(["#fcefb4", "#f8d27a", "#f0a14b", "#dc6a31", "#b5372b", "#761c20"]); // warm yellow -> deep red

  // Filter 1: What the colour shows
  const METRICS = {
    pct_threat: { label: "% of species threatened (VU/EN/CR)", fmt: v => d3.format(".0f")(v) + "%",
                  denom: s => s.filter(d => ASSESSED.has(d.status)),
                  value: (s, ok) => 100 * ok.filter(d => THREATENED.has(d.status)).length / ok.length,
                  scheme: RISK, fixed: [0, 100] },
    n_threat:   { label: "Number of threatened species", fmt: d3.format(".0f"),
                  denom: s => s, value: s => s.filter(d => THREATENED.has(d.status)).length, scheme: RISK },
    n_extinct:  { label: "Extinct or possibly extinct species", fmt: d3.format(".0f"),
                  denom: s => s, value: s => s.filter(d => EXTINCT.has(d.status)).length,
                  scheme: ramp(["#f2f0eb", "#cfcbc1", "#9a958a", "#625e55", "#2b2925"]) },
    n_species:  { label: "Number of parrot species", fmt: d3.format(".0f"),
                  denom: s => s, value: s => s.length,
                  scheme: ramp(["#eef5ec", "#c2dfbb", "#82bb83", "#438d59", "#1d5d3c", "#0f3a27"]) },
    mass:       { label: "Median body mass (g)", fmt: v => d3.format(".0f")(v) + " g",
                  denom: s => s.filter(d => d.mass != null), value: (s, ok) => d3.median(ok, d => d.mass),
                  scheme: ramp(["#f4f0f9", "#d6cae8", "#aa9acd", "#7b66ae", "#533f89", "#30235a"]) },
    hb:         { label: "Mean habitat breadth (# habitats)", fmt: d3.format(".1f"),
                  denom: s => s.filter(d => d.hb != null), value: (s, ok) => d3.mean(ok, d => d.hb),
                  scheme: ramp(["#e8f1fc", "#a6c9f3", "#5d9be6", "#2a6fc4", "#1a4f93", "#0d356a"]) },
  };
  // Filter 2: Which parrots are counted
  const GROUPS = {
    all: { label: "All parrots", test: () => true },
    island: { label: "Island-restricted breeders", test: d => d.isl === 1 },
    mainland: { label: "Mainland species", test: d => d.isl === 0 },
    rr: { label: "Restricted range (< 50,000 km²)", test: d => d.rr === 1 },
    wide: { label: "Wide-ranging", test: d => d.rr === 0 },
    forest: { label: "Forest is primary habitat", test: d => d.habitat === "Forest" },
    small: { label: "Small (< 120 g)", test: d => d.mass != null && d.mass < 120 },
    large: { label: "Large (≥ 120 g)", test: d => d.mass != null && d.mass >= 120 },
  };

  const TEMPLATE = `
    <div class="pcv-frame">
      <div class="pcv-main">
        <section class="pcv-mapcol" aria-label="World map">
          <div class="pcv-toolbar">
            <label class="pcv-field"><span>Color regions by</span><select class="pcv-metric"></select></label>
            <label class="pcv-field"><span>Species shown</span><select class="pcv-group"></select></label>
            <div class="pcv-highest" aria-live="polite"></div>
          </div>
          <div class="pcv-map"></div>
          <div class="pcv-legend">
            <div class="pcv-scale">
              <div class="pcv-scale-title"></div>
              <div class="pcv-ramp"></div>
              <div class="pcv-ticks"></div>
            </div>
            <span class="pcv-keyitem"><svg viewBox="0 0 18 10" aria-hidden="true"><rect width="18" height="10" style="fill:var(--pcv-nodata)"/><rect width="18" height="10" fill="url(#pcv-hatch)"/></svg>Fewer than ${MIN_N} species</span>
            <span class="pcv-keyitem"><svg viewBox="0 0 18 10" aria-hidden="true"><rect width="18" height="10" style="fill:var(--pcv-land-empty)"/></svg>No parrots</span>
          </div>
        </section>
        <aside class="pcv-side" aria-label="Region details" aria-live="polite">
          <div class="pcv-panel"><p class="pcv-loading">Loading parrot data…</p></div>
        </aside>
      </div>
      <section class="pcv-rank" aria-label="Region ranking">
        <div class="pcv-rankhead">
          <div><p class="pcv-kicker">Region ranking</p><h4 class="pcv-ranktitle"></h4></div>
          <p class="pcv-rankhint">Hover a bar to find it on the map · click for details</p>
        </div>
        <div class="pcv-bars"></div>
      </section>
      <p class="pcv-note"></p>
    </div>
    <div class="pcv-tip" hidden></div>`;

  const GLOBE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>`;

  function init(target, opts = {}) {
    const el = typeof target === "string" ? document.querySelector(target) : target;
    if (!el) { console.warn("ParrotConservationViz: container not found:", target); return null; }
    if (el.__pcv) return el.__pcv;
    if (el.id !== ROOT_ID) console.warn(`ParrotConservationViz: give the container id="${ROOT_ID}" so its styles apply.`);
    let dataPath = opts.dataPath ?? el.dataset.path ?? "data/";
    if (dataPath && !dataPath.endsWith("/")) dataPath += "/";

    el.classList.remove("visualization-placeholder");
    const root = d3.select(el).html(TEMPLATE);
    const frameEl = root.select(".pcv-frame").node();

    // Tooltip
    const tip = root.select(".pcv-tip");
    const showTip = (ev, html) => {
      if (html != null) tip.html(html);
      tip.attr("hidden", null);
      const n = tip.node(), w = n.offsetWidth, h = n.offsetHeight, pad = 14;
      let x = ev.clientX + pad, y = ev.clientY + pad;
      if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
      if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
      tip.style("left", Math.max(8, x) + "px").style("top", Math.max(8, y) + "px");
    };
    const hideTip = () => tip.attr("hidden", true);

    root.select(".pcv-metric").selectAll("option").data(Object.entries(METRICS)).join("option")
      .attr("value", d => d[0]).text(d => d[1].label);
    root.select(".pcv-group").selectAll("option").data(Object.entries(GROUPS)).join("option")
      .attr("value", d => d[0]).text(d => d[1].label);

    const api = { destroy() {} };
    el.__pcv = api;

    Promise.all([
        d3.json(dataPath + "parrots.json"),
        d3.json(dataPath + "realms.geojson")
    ])
    .then(([parrots, realms]) => {
        if (!Array.isArray(parrots)) {
            throw new Error("parrots.json must contain an array.");
        }

        if (!realms || !Array.isArray(realms.features)) {
            throw new Error("realms.geojson must contain a valid FeatureCollection.");
        }

        build(parrots, realms);
    })
    .catch(err => {
        console.error("ParrotConservationViz:", err);

        root.select(".pcv-frame")
            .html(`
            <p class="pcv-error">
                Unable to load visualization data.
                Check that parrots.json and realms.geojson exist
                in the specified data folder.
            </p>
            `);
    });

    function build(parrots, realms) {
      let metric = "pct_threat", group = "all", selected = null, hovered = null;
      let st = {}, color = null;
      const T = () => d3.transition().duration(600).ease(d3.easeCubicInOut);
      const realmOf = d => d.properties ? d.properties.realm : d[0];

      // Map (re-laid-out at its real pixel width so text stays crisp)
      const mapEl = root.select(".pcv-map");
      const svg = mapEl.append("svg").attr("role", "img")
        .attr("aria-label", "World map of parrot conservation metrics by biogeographic realm");
      svg.append("defs").append("pattern").attr("id", "pcv-hatch").attr("patternUnits", "userSpaceOnUse")
        .attr("width", 5).attr("height", 5).attr("patternTransform", "rotate(45)")
        .append("line").attr("class", "pcv-hatch-line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 5);
      const proj = d3.geoEqualEarth().rotate([-150, 0]); // Pacific-centred so Oceania stays whole
      const path = d3.geoPath(proj);
      const sphere = svg.append("path").datum({ type: "Sphere" }).attr("class", "pcv-sphere");
      const grat = svg.append("path").datum(d3.geoGraticule10()).attr("class", "pcv-graticule");
      const shapes = svg.append("g").selectAll("path").data(realms.features).join("path")
        .attr("class", "pcv-realm").classed("pcv-empty", f => !REALM_NAMES[f.properties.realm]);
      const hatches = svg.append("g").selectAll("path").data(realms.features.filter(f => REALM_NAMES[f.properties.realm]))
        .join("path").attr("class", "pcv-hatch");
      const dots = svg.append("g").selectAll("circle").data(ISLANDS).join("circle").attr("class", "pcv-realm pcv-island");
      const labels = svg.append("g").selectAll("text").data(Object.keys(LABEL_AT)).join("text")
        .attr("class", "pcv-label").attr("text-anchor", "middle").attr("dy", "0.35em");

      function layoutMap() {
        const W = Math.max(Math.round(mapEl.node().clientWidth) || 760, 260), H = Math.round(W * 0.5);
        svg.attr("viewBox", `0 0 ${W} ${H}`);
        proj.fitExtent([[2, 2], [W - 2, H - 2]], { type: "Sphere" });
        sphere.attr("d", path); grat.attr("d", path); shapes.attr("d", path); hatches.attr("d", path);
        dots.attr("r", Math.max(3, W / 210))
          .attr("cx", d => proj([d[1], d[2]])[0]).attr("cy", d => proj([d[1], d[2]])[1]);
        labels.attr("x", k => proj(LABEL_AT[k])[0]).attr("y", k => proj(LABEL_AT[k])[1])
          .style("font-size", W < 420 ? "9.5px" : W < 640 ? "10.5px" : null);
      }

      function stats() {
        const sub = parrots.filter(GROUPS[group].test);
        const M = METRICS[metric];
        const out = {};
        for (const k of Object.keys(REALM_NAMES)) {
          const s = sub.filter(d => d.realms.includes(k));
          const ok = M.denom(s);
          out[k] = { k, all: s, n: ok.length, value: ok.length >= MIN_N ? M.value(s, ok) : null };
        }
        return out;
      }

      function update(animatePanel = false) {
        st = stats();
        const M = METRICS[metric];
        const vals = Object.values(st).map(d => d.value).filter(v => v != null);
        const dom = M.fixed || [0, d3.max(vals) || 1];
        color = d3.scaleSequential(M.scheme).domain([dom[0] - (dom[1] - dom[0]) * 0.08, dom[1]]);
        const fill = d => { const s = st[realmOf(d)]; return s && s.value != null ? color(s.value) : null; };
        const keepFill = function (d) { return fill(d) || this.getAttribute("fill") || "#d6d3c9"; };

        shapes.filter(f => REALM_NAMES[f.properties.realm]).transition(T()).attr("fill", keepFill);
        dots.transition(T()).attr("fill", keepFill);
        shapes.classed("pcv-nodata", f => !!REALM_NAMES[realmOf(f)] && st[realmOf(f)].value == null);
        dots.classed("pcv-nodata", d => st[realmOf(d)].value == null);
        hatches.classed("pcv-on", f => st[realmOf(f)].value == null);

        // Value labels count smoothly between states
        labels.transition(T()).tween("text", function (k) {
          const v1 = st[k].value, v0 = this.__v ?? v1, self = d3.select(this);
          this.__v = v1;
          if (v1 == null) return () => self.text("");
          const i = d3.interpolateNumber(v0 ?? v1, v1);
          return t => self.text(M.fmt(i(t)));
        });

        // Headline: Realm with the highest value
        root.select(".pcv-ranktitle").text(`Regions ranked by ${M.label.charAt(0).toLowerCase() + M.label.slice(1)}`);
        const top = Object.values(st).filter(d => d.value != null).sort((a, b) => b.value - a.value)[0];
        root.select(".pcv-highest").html(top
          ? `<i style="background:${color(top.value)}"></i>Highest: <b>${REALM_NAMES[top.k]}</b> ${M.fmt(top.value)} <span>· n = ${top.n}</span>`
          : "No region has enough species");

        // Legend
        root.select(".pcv-scale-title").text(M.label);
        root.select(".pcv-ramp").style("background",
          `linear-gradient(to right, ${d3.range(0, 1.001, 0.1).map(t => color(dom[0] + t * (dom[1] - dom[0]))).join(",")})`);
        const lx = d3.scaleLinear().domain(dom).range([0, 100]);
        root.select(".pcv-ticks").selectAll("span").data(lx.ticks(5)).join("span")
          .style("left", t => lx(t) + "%").text(M.fmt);

        drawBars();
        renderPanel(animatePanel);
        paintHighlight();
        root.select(".pcv-note").text(
          `Showing: ${GROUPS[group].label.toLowerCase()}. ` +
          (metric === "pct_threat" ? "Percent is out of species with an IUCN assessment (extinct, data-deficient and unassessed species excluded). " : "") +
          `Regions with fewer than ${MIN_N} qualifying species are hatched rather than colored. ` +
          "Species found in two realms are counted in both. Realm borders follow countries and are approximate. " +
          "Source: BIRDBASE v2025.1 (Şekercioğlu et al.).");
      }

      // Ranking chart (linked to map)
      const barsEl = root.select(".pcv-bars");
      const barSvg = barsEl.append("svg");
      const barPath = (w, h, r) => { // flat at the baseline, rounded at the data end
        if (w <= 0) return "";
        r = Math.min(r, w, h / 2);
        return `M0,0H${w - r}Q${w},0 ${w},${r}V${h - r}Q${w},${h} ${w - r},${h}H0Z`;
      };
      function drawBars() {
        const M = METRICS[metric];
        const data = Object.values(st).sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
        const topK = data[0] && data[0].value != null ? data[0].k : null;
        const bw = Math.max(Math.round(barsEl.node().clientWidth) || 760, 260), narrow = bw < 560;
        const rowH = 28, barH = 12, m = { l: narrow ? 148 : 200, r: narrow ? 78 : 160 };
        const x = d3.scaleLinear().domain([0, d3.max(data, d => d.value) || 1]).range([0, Math.max(bw - m.l - m.r, 40)]);
        barSvg.attr("viewBox", `0 0 ${bw} ${data.length * rowH}`);

        const row = barSvg.selectAll("g.pcv-row").data(data, d => d.k).join(enter => {
          const g = enter.append("g").attr("class", "pcv-row").attr("tabindex", 0).attr("role", "button")
            .attr("transform", (d, i) => `translate(0,${i * rowH})`);
          g.append("rect").attr("class", "pcv-hit").attr("rx", 5);
          g.append("text").attr("class", "pcv-rnum").attr("x", 8);
          g.append("text").attr("class", "pcv-rname");
          g.append("rect").attr("class", "pcv-track").attr("rx", 3);
          g.append("path").attr("class", "pcv-bar");
          g.append("text").attr("class", "pcv-vtext");
          return g;
        });
        const enterRow = (ev, d) => { hovered = d.k; paintHighlight(); };
        const leaveRow = () => { hovered = null; hideTip(); paintHighlight(); };
        row.attr("aria-label", d => `${REALM_NAMES[d.k]}: ${d.value == null ? "too few species" : M.fmt(d.value)}`)
          .classed("pcv-top", d => d.k === topK).classed("pcv-selrow", d => d.k === selected)
          .on("mouseenter", (ev, d) => { enterRow(ev, d); showTip(ev, tipHtml(d.k)); })
          .on("mousemove", ev => showTip(ev))
          .on("mouseleave", leaveRow)
          .on("focus", enterRow).on("blur", leaveRow)
          .on("click", (ev, d) => select(d.k))
          .on("keydown", (ev, d) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(d.k); } });
        row.transition(T()).attr("transform", (d, i) => `translate(0,${i * rowH})`);

        row.select(".pcv-hit").attr("x", 0).attr("y", 1).attr("width", bw).attr("height", rowH - 2);
        row.select(".pcv-rnum").attr("y", rowH / 2).attr("dy", "0.35em").text((d, i) => String(i + 1).padStart(2, "0"));
        row.select(".pcv-rname").attr("x", m.l - 10).attr("y", rowH / 2).attr("dy", "0.35em").attr("text-anchor", "end")
          .text(d => (narrow ? SHORT_NAMES : REALM_NAMES)[d.k]);
        row.select(".pcv-track").attr("x", m.l).attr("y", (rowH - barH) / 2).attr("height", barH).attr("width", x.range()[1]);
        row.select(".pcv-bar").attr("transform", `translate(${m.l},${(rowH - barH) / 2})`)
          .transition(T())
          .attr("d", d => barPath(d.value == null ? 0 : x(d.value), barH, 3))
          .attr("fill", d => d.value == null ? "none" : color(d.value));
        row.select(".pcv-vtext").attr("y", rowH / 2).attr("dy", "0.35em")
          .html(d => d.value == null
            ? `<tspan class="pcv-n">too few (n = ${d.n})</tspan>`
            : `<tspan class="pcv-val">${M.fmt(d.value)}</tspan><tspan class="pcv-n" dx="6">n = ${d.n}</tspan>` +
              (d.k === topK && !narrow ? `<tspan class="pcv-tag" dx="10">HIGHEST</tspan>` : ""))
          .transition(T()).attr("x", d => m.l + (d.value == null ? 0 : x(d.value)) + 8);
      }

      function paintHighlight() {
        const k = hovered;
        shapes.classed("pcv-dim", f => k && realmOf(f) !== k).classed("pcv-hot", f => k && realmOf(f) === k)
          .classed("pcv-sel", f => !k && selected && realmOf(f) === selected);
        dots.classed("pcv-dim", d => k && realmOf(d) !== k).classed("pcv-hot", d => k && realmOf(d) === k);
        labels.classed("pcv-dim", d => k && d !== k);
        barSvg.selectAll(".pcv-row").classed("pcv-dim", d => k && d.k !== k);
        const lift = k || selected;
        if (lift) shapes.filter(function (f) { return realmOf(f) === lift && this.nextSibling; }).raise();
      }

      // Detail panel: global overview, or the selected region
      function renderPanel(animate) {
        const panel = root.select(".pcv-panel").html("");
        if (animate) { panel.classed("pcv-enter", false); panel.node().offsetWidth; panel.classed("pcv-enter", true); }
        const sub = parrots.filter(GROUPS[group].test);
        const s = selected ? st[selected] : null;
        const list = s ? s.all : sub;

        const head = panel.append("div").attr("class", "pcv-phead");
        const ht = head.append("div");
        ht.append("p").attr("class", "pcv-kicker").text(s ? "Biogeographic realm" : "All regions");
        ht.append("h4").attr("class", "pcv-ptitle").text(s ? REALM_NAMES[s.k] : "Global overview");
        if (s) head.append("button").attr("type", "button").attr("class", "pcv-close")
          .attr("aria-label", "Clear selection").attr("title", "Clear selection (Esc)").text("×")
          .on("click", () => select(null));

        panel.append("div").attr("class", "pcv-total")
          .html(`<b>${d3.format(",")(list.length)}</b><span>parrot species</span>`);
        panel.append("p").attr("class", "pcv-sub").text(GROUPS[group].label);

        // IUCN stacked bar + compact code key
        const counts = IUCN.map(([c, lab, col]) => ({ c, lab, col, n: list.filter(d => iucnKey(d.status) === c).length }))
          .filter(d => d.n);
        const total = d3.sum(counts, d => d.n) || 1;
        panel.append("p").attr("class", "pcv-section").text("Red List status");
        panel.append("div").attr("class", "pcv-stack").attr("role", "img")
          .attr("aria-label", counts.map(d => `${d.lab} ${d.n}`).join(", "))
          .selectAll("div").data(counts).join("div")
          .style("flex-grow", d => d.n).style("background", d => d.col)
          .on("mousemove", (ev, d) => showTip(ev, `<div class="pcv-tt-title">${d.c} · ${d.lab}</div>
              <div class="pcv-tt-big"><i style="background:${d.col}"></i><b>${d.n}</b><span>${d3.format(".0%")(d.n / total)} of species</span></div>`))
          .on("mouseleave", hideTip);
        panel.append("ul").attr("class", "pcv-chips").selectAll("li").data(counts).join("li")
          .attr("title", d => `${d.lab}: ${d.n}`)
          .html(d => `<i style="background:${d.col}"></i><b>${d.c}</b><span>${d.n}</span>`);

        if (!s) {
          const thr = sub.filter(d => THREATENED.has(d.status)).length;
          const ext = sub.filter(d => EXTINCT.has(d.status)).length;
          panel.append("dl").attr("class", "pcv-facts").html(
            `<div><dt>Threatened (VU–CR)</dt><dd>${d3.format(",")(thr)}</dd></div>` +
            `<div><dt>Extinct or possibly extinct</dt><dd>${d3.format(",")(ext)}</dd></div>`);
          panel.append("p").attr("class", "pcv-hint")
            .html(`${GLOBE}<span>Select a region on the map or in the ranking to list its threatened species.</span>`);
          return;
        }

        // Threatened / extinct list, grouped by status (most severe first)
        const order = ["EX", "EW", "CR", "EN", "VU"];
        const risky = s.all.filter(d => order.includes(iucnKey(d.status)))
          .sort((a, b) => order.indexOf(iucnKey(a.status)) - order.indexOf(iucnKey(b.status)));
        panel.append("p").attr("class", "pcv-section pcv-listtitle").text(`${risky.length} threatened or extinct`);
        if (!risky.length) { panel.append("p").attr("class", "pcv-none").text("No threatened or extinct species in this selection."); return; }
        const wrap = panel.append("div").attr("class", "pcv-listwrap").attr("tabindex", 0)
          .attr("aria-label", `Threatened and extinct species in ${REALM_NAMES[s.k]}`);
        for (const [key, items] of d3.group(risky, d => iucnKey(d.status))) {
          const [code, lab, col] = iucnOf(key);
          wrap.append("div").attr("class", "pcv-group")
            .html(`<i style="background:${col}"></i><b>${code}</b>${lab}<span>${items.length}</span>`);
          wrap.append("ul").attr("class", "pcv-list").selectAll("li").data(items).join("li").html(d => {
            const meta = [d.latin ? `<em>${d.latin}</em>` : "", d.mass ? d.mass + " g" : "", d.isl ? "island" : "", d.rr ? "small range" : ""]
              .filter(Boolean).join(" · ");
            const note = STATUS_NOTE[d.status] ? `<span class="pcv-pe" title="${d.status}">${STATUS_NOTE[d.status]}</span>` : "";
            return `<span class="pcv-name">${d.name}${note}</span><span class="pcv-meta">${meta}</span>`;
          });
        }
      }

      function select(k) {
        const changed = k !== selected;
        selected = k;
        hovered = null;
        hideTip();
        update(changed);
      }

      // Tooltips + events
      function tipHtml(k, place) {
        const s = st[k], M = METRICS[metric];
        if (!s) return `<div class="pcv-tt-title">No parrots</div>`;
        const thr = s.all.filter(d => THREATENED.has(d.status)).length;
        const assessed = s.all.filter(d => ASSESSED.has(d.status)).length;
        const ext = s.all.filter(d => EXTINCT.has(d.status)).length;
        const big = s.value == null
          ? `<div class="pcv-tt-warn">Too few species to compute (n = ${s.n}; at least ${MIN_N} needed)</div>`
          : `<div class="pcv-tt-big"><i style="background:${color(s.value)}"></i><b>${M.fmt(s.value)}</b></div><div class="pcv-tt-lab">${M.label}</div>`;
        return `<div class="pcv-tt-title">${REALM_NAMES[k]}${place ? ` <span>· ${place}</span>` : ""}</div>${big}
          <dl>
            <dt>Parrot species</dt><dd>${s.all.length}</dd>
            <dt>Threatened (VU–CR)</dt><dd>${thr}</dd>
            <dt>% of assessed threatened</dt><dd>${assessed ? d3.format(".0f")(100 * thr / assessed) + "%" : "–"}</dd>
            <dt>Extinct or possibly</dt><dd>${ext}</dd>
            ${s.n !== s.all.length ? `<dt>Counted for this metric</dt><dd>${s.n}</dd>` : ""}
          </dl>
          <div class="pcv-tt-hint">Click for species details</div>`;
      }
      const enter = (ev, d) => { hovered = realmOf(d); paintHighlight(); showTip(ev, tipHtml(realmOf(d), d.properties ? null : d[3])); };
      const move = ev => showTip(ev);
      const leave = () => { hovered = null; hideTip(); paintHighlight(); };
      shapes.filter(f => REALM_NAMES[f.properties.realm])
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", f => `Select ${REALM_NAMES[realmOf(f)]} realm`)
        .on("mouseenter", enter)
        .on("mousemove", move)
        .on("mouseleave", leave)
        .on("focus", (ev, f) => {
            hovered = realmOf(f);
            paintHighlight();
            showTip(ev, tipHtml(realmOf(f)));
        })
        .on("blur", leave)
        .on("click", (ev, f) => select(realmOf(f)))
        .on("keydown", (ev, f) => {
            if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            select(realmOf(f));
            }
        });

        dots
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", d => `Select ${REALM_NAMES[d[0]]} realm`)
        .on("mouseenter", enter)
        .on("mousemove", move)
        .on("mouseleave", leave)
        .on("focus", (ev, d) => {
            hovered = realmOf(d);
            paintHighlight();
            showTip(ev, tipHtml(realmOf(d), d[3]));
        })
        .on("blur", leave)
        .on("click", (ev, d) => select(realmOf(d)))
        .on("keydown", (ev, d) => {
            if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                select(realmOf(d));
            }
        });
      root.select(".pcv-metric").on("change", function () { metric = this.value; update(); });
      root.select(".pcv-group").on("change", function () { group = this.value; update(); });
      const onKey = ev => { if (ev.key === "Escape" && selected) select(null); };
      window.addEventListener("keydown", onKey);

      // Container-responsive: redraw the map and bars when the card resizes
      let lastW = frameEl.clientWidth, raf = 0;
      const ro = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const w = frameEl.clientWidth;
          if (Math.abs(w - lastW) < 2) return;
          lastW = w; layoutMap(); drawBars(); paintHighlight();
        });
      });
      ro.observe(frameEl);

      api.destroy = () => {
        ro.disconnect(); window.removeEventListener("keydown", onKey);
        el.innerHTML = ""; delete el.__pcv;
      };

      layoutMap();
      update();
    }

    return api;
  }

  window.ParrotConservationViz = { init };

  // Auto-start on the standard container
  const autoStart = () => { const el = document.getElementById(ROOT_ID); if (el) init(el); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoStart);
  else autoStart();
})();