// Created by Aditi Singh

// Interactive horizontal bar chart, D3 v7

// Each bar = % of parrot species in a trait group that are threatened
// (IUCN Vulnerable, Endangered or Critically Endangered).
// A dropdown switches which trait the groups come from.

// Usage: put <div id="barchart"></div> on the page, load d3 v7, then this file.
// Everything is wrapped in a function so it won't clash with teammates' code.

(function () {
 const DATA_PATH = "data/bird_data.csv"; // change if the site keeps data elsewhere
 const CONTAINER = "#visualization-2";


 const STATUS_COL = "2024 IUCN Red List category";
 const ASSESSED = ["LC", "NT", "VU", "EN", "CR", "CR (PE)"]; // living, assessed species only
 const THREATENED = ["VU", "EN", "CR", "CR (PE)"];


 const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);


 // Each trait: a label, a function that puts a species into a group
 // (or null if the data is missing), and the group order (low risk -> high risk
 // is NOT assumed; groups are in their natural order so trends are visible).
 const TRAITS = [
   {
     id: "range",
     label: "Geographic range size",
     question: "Does living in a small area matter?",
     groups: ["Wide range", "Restricted range (< 50,000 km²)"],
     assign: (d) => {
       const v = num(d["RR"]);
       return v == null ? null : v === 1 ? "Restricted range (< 50,000 km²)" : "Wide range";
     },
   },
   {
     id: "mass",
     label: "Body mass",
     question: "Are bigger parrots more at risk?",
     groups: ["Small (under 75 g)", "Medium (75–175 g)", "Large (over 175 g)"],
     assign: (d) => {
       const v = num(d["Average Mass"]);
       if (v == null) return null;
       return v < 75 ? "Small (under 75 g)" : v <= 175 ? "Medium (75–175 g)" : "Large (over 175 g)";
     },
   },
   {
     id: "habitat",
     label: "Habitat breadth",
     question: "Are habitat specialists more at risk?",
     groups: ["1 habitat type", "2 habitat types", "3 habitat types", "4 or more habitat types"],
     assign: (d) => {
       const v = num(d["HB"]);
       if (v == null || v < 1) return null;
       return v >= 4 ? "4 or more habitat types" : v === 1 ? "1 habitat type" : `${v} habitat types`;
     },
   },
   {
     id: "elev",
     label: "Elevation range",
     question: "Does a narrow band of elevation matter?",
     groups: ["Narrow (under 800 m)", "Medium (800–1,400 m)", "Wide (over 1,400 m)"],
     assign: (d) => {
       const v = num(d["Elevational Range"]);
       if (v == null) return null;
       return v < 800 ? "Narrow (under 800 m)" : v <= 1400 ? "Medium (800–1,400 m)" : "Wide (over 1,400 m)";
     },
   },
   {
     id: "island",
     label: "Island vs. mainland",
     question: "Are island parrots more at risk?",
     groups: ["Mainland", "Breeds only on islands"],
     assign: (d) => {
       const v = num(d["ISL"]);
       return v == null ? null : v === 1 ? "Breeds only on islands" : "Mainland";
     },
   },
   {
     id: "clutch",
     label: "Clutch size (max eggs)",
     question: "Do parrots that lay fewer eggs struggle more?",
     groups: ["1–3 eggs", "4 eggs", "5 or more eggs"],
     assign: (d) => {
       const v = num(d["Clutch_Max"]);
       if (v == null) return null;
       return v <= 3 ? "1–3 eggs" : v === 4 ? "4 eggs" : "5 or more eggs";
     },
   },
 ];


 // Layout
 const margin = { top: 112, right: 70, bottom: 50, left: 230 };
 const width = 820;
 const barSlot = 62; // vertical space per bar
 const maxGroups = d3.max(TRAITS, (t) => t.groups.length);
 const innerW = width - margin.left - margin.right;
 const innerH = barSlot * maxGroups;
 const height = innerH + margin.top + margin.bottom;


 const root = d3.select(CONTAINER).classed("bc-root", true);

 // Clear the container before rendering
root.html("");

 // Controls
 const controls = root.append("div").attr("class", "bc-controls");
 controls.append("label").attr("for", "bc-trait").text("Compare parrots by: ");
 const select = controls.append("select").attr("id", "bc-trait");
 select
   .selectAll("option")
   .data(TRAITS)
   .join("option")
   .attr("value", (t) => t.id)
   .text((t) => t.label);


 const svg = root
   .append("svg")
   .attr("class", "bc-svg")
   .attr("viewBox", `0 0 ${width} ${height}`)
   .attr("role", "img")
   .attr("aria-label", "Bar chart of the percentage of parrot species threatened, by trait group");


 const title = svg.append("text").attr("class", "bc-title").attr("x", 10).attr("y", 28);
 const subtitle = svg.append("text").attr("class", "bc-subtitle").attr("x", 10).attr("y", 52);


 const noteText = svg.append("text").attr("class", "bc-note").attr("x", 10).attr("y", 80);


 const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);


 const x = d3.scaleLinear().domain([0, 70]).range([0, innerW]);
 const y = d3.scaleBand().paddingInner(0.3).paddingOuter(0.15);


 const xAxisG = g.append("g").attr("class", "bc-axis").attr("transform", `translate(0,${innerH})`);
 xAxisG.call(d3.axisBottom(x).ticks(7).tickFormat((d) => d + "%").tickSizeOuter(0));
 g.append("g")
   .attr("class", "bc-grid")
   .call(d3.axisBottom(x).ticks(7).tickSize(innerH).tickFormat(""))
   .call((s) => s.select(".domain").remove());
 g.append("text")
   .attr("class", "bc-axis-label")
   .attr("x", innerW / 2)
   .attr("y", innerH + 40)
   .attr("text-anchor", "middle")
   .text("% of species threatened (Vulnerable, Endangered or Critically Endangered)");


 const yAxisG = g.append("g").attr("class", "bc-axis bc-yaxis");
 const baselineG = g.append("g").attr("class", "bc-baseline");
 const barsG = g.append("g");


 const tooltip = root.append("div").attr("class", "bc-tooltip").style("opacity", 0);


 // Data
 d3.csv(DATA_PATH).then((raw) => {
   const parrots = raw.filter(
     (d) => d["Order"] === "Psittaciformes" && ASSESSED.includes((d[STATUS_COL] || "").trim())
   );
   
   parrots.forEach((d) => (d._status = d[STATUS_COL].trim()));
   const overall = (100 * parrots.filter((d) => THREATENED.includes(d._status)).length) / parrots.length;


   function summarize(trait) {
     return trait.groups.map((grp) => {
       const members = parrots.filter((d) => trait.assign(d) === grp);
       const count = (codes) => members.filter((d) => codes.includes(d._status)).length;
       const thr = count(THREATENED);
       return {
         group: grp,
         n: members.length,
         threatened: thr,
         pct: members.length ? (100 * thr) / members.length : 0,
         vu: count(["VU"]),
         en: count(["EN"]),
         cr: count(["CR", "CR (PE)"]),
         examples: members
           .filter((d) => THREATENED.includes(d._status))
           .slice(0, 3)
           .map((d) => d["English Name (BirdLife > IOC > Clements>AviList)"]),
       };
     });
   }


   function update(traitId) {
     const trait = TRAITS.find((t) => t.id === traitId);
     const data = summarize(trait);
     const hi = d3.max(data, (d) => d.pct);
     const lo = d3.min(data, (d) => d.pct);
     const top = data.find((d) => d.pct === hi);
     const bottom = data.find((d) => d.pct === lo);


     title.text(trait.question);
     const shown = d3.sum(data, (d) => d.n);
     subtitle.text(
       `${shown} of ${parrots.length} assessed parrot species, grouped by ${trait.label.toLowerCase()}` +
         (shown < parrots.length ? " (others have no data for this trait)" : "")
     );


     // Keep bars the same thickness whatever the number of groups
     const h = barSlot * data.length;
     y.domain(data.map((d) => d.group)).range([(innerH - h) / 2, (innerH + h) / 2]);


     const t = svg.transition().duration(750).ease(d3.easeCubicInOut);


     yAxisG
       .transition(t)
       .call(d3.axisLeft(y).tickSize(0).tickPadding(12))
       .call((s) => s.select(".domain").remove());


     // Bars
     // Animate in two stages (old bars shrink, then new bars grow),
     // Following Heer & Robertson (2007): stage changes so each is easy to follow.
     barsG
       .selectAll("rect.bc-bar")
       .data(data, (d) => d.group)
       .join(
         (enter) =>
           enter
             .append("rect")
             .attr("class", "bc-bar")
             .attr("x", 0)
             .attr("y", (d) => y(d.group))
             .attr("height", y.bandwidth())
             .attr("width", 0)
             .call((e) => e.transition(t).delay(250).attr("width", (d) => x(d.pct))),
         (upd) =>
           upd.call((u) =>
             u
               .transition(t)
               .attr("y", (d) => y(d.group))
               .attr("height", y.bandwidth())
               .attr("width", (d) => x(d.pct))
           ),
         (exit) => exit.call((e) => e.transition().duration(250).attr("width", 0).remove())
       )
       .classed("bc-bar--top", (d) => d.pct === hi)
       .on("mouseenter", (event, d) => {
         tooltip
           .style("opacity", 1)
           .html(
             `<strong>${d.group}</strong><br>` +
               `${d.threatened} of ${d.n} species threatened (${d.pct.toFixed(0)}%)<br>` +
               `<span class="bc-tt-break">Critically Endangered: ${d.cr} · Endangered: ${d.en} · Vulnerable: ${d.vu}</span>` +
               (d.examples.length ? `<br><em>e.g. ${d.examples.join(", ")}</em>` : "")
           );
       })
       .on("mousemove", (event) => {
         const [mx, my] = d3.pointer(event, root.node());
         tooltip.style("left", mx + 16 + "px").style("top", my + 12 + "px");
       })
       .on("mouseleave", () => tooltip.style("opacity", 0));


     // Value labels at the end of each bar
     barsG
       .selectAll("text.bc-value")
       .data(data, (d) => d.group)
       .join(
         (enter) =>
           enter
             .append("text")
             .attr("class", "bc-value")
             .attr("x", 6)
             .attr("y", (d) => y(d.group) + y.bandwidth() / 2)
             .attr("dy", "0.35em")
             .style("opacity", 0),
         (upd) => upd,
         (exit) => exit.remove()
       )
       .text((d) => `${d.pct.toFixed(0)}%`)
       .transition(t)
       .delay(250)
       .style("opacity", 1)
       .attr("x", (d) => x(d.pct) + 6)
       .attr("y", (d) => y(d.group) + y.bandwidth() / 2);


     // Reference line: all parrots
     baselineG
       .selectAll("line")
       .data([overall])
       .join("line")
       .attr("x1", (d) => x(d))
       .attr("x2", (d) => x(d))
       .attr("y1", -8)
       .attr("y2", innerH);
     baselineG
       .selectAll("text")
       .data([overall])
       .join("text")
       .attr("x", (d) => x(d) + 4)
       .attr("y", -12)
       .text((d) => `All parrots: ${d.toFixed(0)}%`);


     // Annotation on the chart: the key takeaway for this trait
     const ratio = lo > 0 ? hi / lo : null;
     const note =
       ratio && ratio >= 1.3
         ? `→ Species in "${top.group}" are ${ratio.toFixed(1)}× as likely to be threatened as those in "${bottom.group}".`
         : `→ Little difference between groups for this trait.`;
     noteText.text(note);
   }


   select.on("change", (event) => update(event.target.value));
   update(TRAITS[0].id);

}).catch((error) => {

    console.error(
        "Error loading bird data for Visualization 2:",
        error
    );

    root.append("p")
        .attr("class", "bc-error")
        .text(
            "Unable to load the bird dataset. Please check the CSV path and file headers."
        );

});

})();