// Created by Gor Abaghyan

// BIRDBASE parrot habitat breadth and IUCN conservation status.

(() => {
    const root = document.querySelector("#visualization-3");
    if (!root) return;

    const filter = root.querySelector("#bubble-range-filter");
    const countLabel = root.querySelector("#bubble-count");
    const chartHost = root.querySelector("#bubble-chart");
    const insight = root.querySelector("#bubble-insight");
    const details = root.querySelector("#bubble-details");

    if (!filter || !countLabel || !chartHost || !insight || !details) {
        console.error("Visualization 3: Required HTML elements are missing.");
        return;
    }

    const categories = ["LC", "NT", "VU", "EN", "CR"];

    const categoryNames = {
        LC: "Least Concern",
        NT: "Near Threatened",
        VU: "Vulnerable",
        EN: "Endangered",
        CR: "Critically Endangered"
    };

    const colors = {
        LC: "#4A8360",
        NT: "#8B9D50",
        VU: "#BE8C3B",
        EN: "#C46B42",
        CR: "#A94742"
    };

    const breadths = d3.range(1, 9);
    const threatened = new Set(["VU", "EN", "CR"]);

    const width = 940;
    const height = 590;

    const x = d3.scalePoint()
        .domain(breadths)
        .range([195, 875]);

    const y = d3.scalePoint()
        .domain(categories)
        .range([160, 468]);

    const radius = d3.scaleSqrt()
        .domain([0, 90])
        .range([0, 34]);

    let selected = null;
    let currentCells = [];

    // SVG setup

    const svg = d3.select(chartHost)
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "group")
        .attr(
            "aria-label",
            "Bubble chart showing parrot species counts by habitat breadth and IUCN conservation status."
        );

    // Grid lines

    svg.selectAll(".bubble-row-line")
        .data(categories)
        .join("line")
        .attr("class", "bubble-row-line")
        .attr("x1", 150)
        .attr("x2", 910)
        .attr("y1", d => y(d))
        .attr("y2", d => y(d));

    svg.selectAll(".bubble-column-line")
        .data(breadths)
        .join("line")
        .attr("class", "bubble-column-line")
        .attr("x1", d => x(d))
        .attr("x2", d => x(d))
        .attr("y1", 125)
        .attr("y2", 495);

    // Axis headings

    svg.append("text")
        .attr("class", "bubble-axis-heading")
        .attr("x", 20)
        .attr("y", 98)
        .text("IUCN category");

    svg.append("text")
        .attr("class", "bubble-axis-heading")
        .attr("x", 195)
        .attr("y", 98)
        .text("Major habitats used");

    // Row labels

    const rowLabels = svg.selectAll(".bubble-row-label")
        .data(categories)
        .join("g")
        .attr("class", "bubble-row-label")
        .attr("transform", d => `translate(20,${y(d) - 8})`);

    rowLabels.append("text")
        .attr("class", "bubble-status-code")
        .text(d => d);

    rowLabels.append("text")
        .attr("class", "bubble-status-name")
        .attr("y", 21)
        .text(d => categoryNames[d]);

    // Column labels

    svg.selectAll(".bubble-column-label")
        .data(breadths)
        .join("text")
        .attr("class", "bubble-column-label")
        .attr("x", d => x(d))
        .attr("y", 526)
        .attr("text-anchor", "middle")
        .text(d => d);

    // Bubble marks

    const marks = svg.append("g")
        .attr("class", "bubble-marks")
        .selectAll(".bubble-mark")
        .data(
            categories.flatMap(status =>
                breadths.map(hb => ({ status, hb }))
            )
        )
        .join("g")
        .attr("class", "bubble-mark")
        .attr(
            "transform",
            d => `translate(${x(d.hb)},${y(d.status)})`
        );

    const circles = marks.append("circle")
        .attr("r", 0)
        .attr("fill", d => colors[d.status])
        .attr("role", "button")
        .attr("tabindex", -1);

    marks.append("text")
        .attr("class", "bubble-value")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .style("pointer-events", "none");

    // Bubble size legend

    const legend = svg.append("g")
        .attr("class", "bubble-size-legend")
        .attr("transform", "translate(20,567)");

    legend.append("text")
        .text("Bubble area = species count");

    [1, 10, 50].forEach((n, i) => {
        const cx = 245 + i * 105;

        legend.append("circle")
            .attr("cx", cx)
            .attr("cy", -6)
            .attr("r", radius(n))
            .attr("fill", "none")
            .attr("stroke", "#65796A");

        legend.append("text")
            .attr("x", cx + 38)
            .attr("y", 0)
            .text(n);
    });

    // Tooltip

    const tooltip = d3.select(root)
        .append("div")
        .attr("class", "bubble-tooltip")
        .attr("role", "status")
        .style("display", "none");

    function cellFor(status, hb) {
        return currentCells.find(
            d => d.status === status && d.hb === hb
        );
    }

    function tooltipText(cell) {
        return `${categoryNames[cell.status]} (${cell.status})
            · ${cell.hb} major habitat${cell.hb === 1 ? "" : "s"}
            · ${cell.species.length} species`;
    }

    function moveTooltip(event) {
        const bounds = root.getBoundingClientRect();

        const left = Math.min(
            event.clientX - bounds.left + 14,
            bounds.width - 230
        );

        tooltip
            .style("left", `${Math.max(8, left)}px`)
            .style("top", `${event.clientY - bounds.top + 14}px`);
    }

    // Bubble interactions

    circles
        .on("pointerenter", (event, d) => {
            const cell = cellFor(d.status, d.hb);

            if (!cell || !cell.species.length) return;

            tooltip
                .text(tooltipText(cell))
                .style("display", "block");

            moveTooltip(event);
        })
        .on("pointermove", moveTooltip)
        .on("pointerleave", () => {
            tooltip.style("display", "none");
        })
        .on("focus", (event, d) => {
            const cell = cellFor(d.status, d.hb);

            if (!cell || !cell.species.length) return;

            tooltip
                .text(tooltipText(cell))
                .style("display", "block")
                .style("left", "12px")
                .style("top", "48px");
        })
        .on("blur", () => {
            tooltip.style("display", "none");
        })
        .on("click", (event, d) => {
            selectCell(d.status, d.hb);
        })
        .on("keydown", (event, d) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectCell(d.status, d.hb);
            }
        });

    // Display selected species

    function selectCell(status, hb) {
        const cell = cellFor(status, hb);

        if (!cell || !cell.species.length) return;

        selected = { status, hb };

        circles.attr("aria-pressed", d =>
            String(d.status === status && d.hb === hb)
        );

        marks.classed("is-selected", d =>
            d.status === status && d.hb === hb
        );

        details.replaceChildren();

        const heading = document.createElement("h4");
        heading.textContent =
            `${categoryNames[status]} · ${hb} major habitat${hb === 1 ? "" : "s"}`;

        details.append(heading);

        const summary = document.createElement("p");
        summary.textContent =
            `${cell.species.length} species in this bubble`;

        details.append(summary);

        const names = [...cell.species].sort(
            (a, b) => a.name.localeCompare(b.name)
        );

        const list = document.createElement("ul");

        names.slice(0, 12).forEach(d => {
            const item = document.createElement("li");
            item.textContent = d.name;
            list.append(item);
        });

        details.append(list);

        if (names.length > 12) {
            const remainder = document.createElement("p");

            remainder.className = "bubble-more";
            remainder.textContent =
                `+ ${names.length - 12} more species`;

            details.append(remainder);
        }
    }

    // Update visualization

    function update(data, animate = true) {

        const shown = data.filter(d => {
            if (filter.value === "all") return true;

            if (filter.value === "restricted") {
                return d.restricted === true;
            }

            if (filter.value === "unrestricted") {
                return d.restricted === false;
            }

            return true;
        });

        const grouped = d3.group(
            shown,
            d => `${d.status}|${d.hb}`
        );

        currentCells = categories.flatMap(status =>
            breadths.map(hb => ({
                status,
                hb,
                species: grouped.get(`${status}|${hb}`) || []
            }))
        );

        // Species count

        const threatenedCount = shown.filter(
            d => threatened.has(d.status)
        ).length;

        const threatenedPercentage = shown.length
            ? Math.round(100 * threatenedCount / shown.length)
            : 0;

        countLabel.textContent =
            `${shown.length} species · ${threatenedPercentage}% threatened`;

        // Habitat breadth comparison

        const oneHabitat = shown.filter(d => d.hb === 1);
        const fourPlus = shown.filter(d => d.hb >= 4);

        const oneThreatened = oneHabitat.filter(
            d => threatened.has(d.status)
        ).length;

        const fourThreatened = fourPlus.filter(
            d => threatened.has(d.status)
        ).length;

        const onePercentage = oneHabitat.length
            ? Math.round(100 * oneThreatened / oneHabitat.length)
            : null;

        const fourPercentage = fourPlus.length
            ? Math.round(100 * fourThreatened / fourPlus.length)
            : null;

        insight.textContent =
            `Threatened share: ${
                onePercentage === null
                    ? "No data"
                    : `${oneThreatened} of ${oneHabitat.length} (${onePercentage}%)`
            } for species using one habitat, versus ${
                fourPercentage === null
                    ? "No data"
                    : `${fourThreatened} of ${fourPlus.length} (${fourPercentage}%)`
            } for species using four or more habitats.`;

        // Bubble animation

        const duration =
            animate &&
            !window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ? 450
                : 0;

        circles.each(function(d) {
            const cell = cellFor(d.status, d.hb);
            const n = cell.species.length;

            d3.select(this)
                .attr("tabindex", n ? 0 : -1)
                .attr("aria-hidden", n ? null : "true")
                .attr("aria-label", n ? tooltipText(cell) : null)
                .transition()
                .duration(duration)
                .attr("r", radius(n))
                .attr("opacity", n ? 1 : 0);
        });

        // Bubble values

        marks.select(".bubble-value")
            .text(d => {
                const n = cellFor(d.status, d.hb).species.length;
                return n >= 3 ? n : "";
            });

        // Preserve selection if possible

        if (
            selected &&
            cellFor(selected.status, selected.hb).species.length
        ) {
            selectCell(selected.status, selected.hb);
        } else {
            selected = null;

            marks.classed("is-selected", false);

            circles.attr("aria-pressed", "false");

            details.replaceChildren();

            const prompt = document.createElement("p");
            prompt.textContent =
                "Select a bubble to see species names.";

            details.append(prompt);
        }

        tooltip.style("display", "none");
    }

    // Load BIRDBASE data

    d3.csv("data/bird_data.csv", d => ({
        order: d.Order,
        name: d["English Name (BirdLife > IOC > Clements>AviList)"],

        status:
            d["2024 IUCN Red List category"] === "CR (PE)"
                ? "CR"
                : d["2024 IUCN Red List category"],

        hb: Number(d.HB),

        restricted:
            d.RR === "1"
                ? true
                : d.RR === "0"
                    ? false
                    : null
    }))
    .then(rows => {

        const data = rows.filter(d =>
            d.order === "Psittaciformes" &&
            categories.includes(d.status) &&
            breadths.includes(d.hb) &&
            d.name
        );

        if (!data.length) {
            throw new Error("No assessed parrot records were found.");
        }

        filter.addEventListener("change", () => update(data));

        update(data, false);
    })
    .catch(error => {
        console.error("Bubble plot data error:", error);

        chartHost.textContent =
            "Unable to load the parrot data. Serve this folder through a local web server and check data/bird_data.csv.";
    });

})();