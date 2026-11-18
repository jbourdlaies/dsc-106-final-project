// Configuration

const heatmapContainer = d3.select("#visualization-1");

// Clear the original placeholder
heatmapContainer.html("");

const heatmapWidth = 950;
const heatmapMargin = {
    top: 55,
    right: 35,
    bottom: 65,
    left: 165
};

const heatmapInnerWidth =
    heatmapWidth - heatmapMargin.left - heatmapMargin.right;

const cellHeight = 48;
const cellGap = 5;

const conservationCategories = [
    "LC", "NT", "VU", "EN", "CR"
];

const conservationLabels = {
    LC: "Least Concern",
    NT: "Near Threatened",
    VU: "Vulnerable",
    EN: "Endangered",
    CR: "Critically Endangered"
};


// Color scale
// Higher percentages receive darker green shades.
// This represents the proportion of species in each cell,
// NOT the severity of the conservation category.

const heatmapColor = d3.scaleSequential()
    .domain([0, 100])
    .interpolator(d3.interpolateGreens);


// Load the data

d3.csv("data/bird_data.csv").then(data => {

    console.log("Original bird records:", data.length);


    // Filter for parrots

    const parrots = data.filter(d =>
        d["Order"]?.trim() === "Psittaciformes"
    );

    console.log("Parrot records:", parrots.length);


    // Clean and prepare data

    const cleanedData = parrots.map(d => ({
        family: d["Family IOC 15.1"]?.trim(),
        commonName: d[
            "English Name (BirdLife > IOC > Clements>AviList)"
        ]?.trim(),
        scientificName: d[
            "Latin (BirdLife > IOC > Clements>AviList)"
        ]?.trim(),
        status: d["2024 IUCN Red List category"]
            ?.trim()
            .toUpperCase()
    })).filter(d =>
        d.family &&
        d.commonName &&
        conservationCategories.includes(d.status)
    );

    console.log(
        "Assessed parrot records:",
        cleanedData.length
    );


    // Calculate family-level conservation statistics

    // Group species by family
    const familyGroups = d3.group(
        cleanedData,
        d => d.family
    );

    const familyData = Array.from(
        familyGroups,
        ([family, species]) => {

            const total = species.length;

            const categoryCounts = {};

            conservationCategories.forEach(category => {

                categoryCounts[category] = species.filter(
                    d => d.status === category
                ).length;

            });

            // Calculate percentage within each family
            const categoryPercentages = {};

            conservationCategories.forEach(category => {

                categoryPercentages[category] =
                    (categoryCounts[category] / total) * 100;

            });

            // Threatened categories: VU, EN, CR
            const threatenedCount =
                categoryCounts.VU +
                categoryCounts.EN +
                categoryCounts.CR;

            const threatenedPercentage =
                (threatenedCount / total) * 100;

            return {
                family,
                total,
                categoryCounts,
                categoryPercentages,
                threatenedCount,
                threatenedPercentage
            };

        }
    );

    console.log("Family statistics:", familyData);


    // Create the chart container

    const chartArea = heatmapContainer
        .append("div")
        .attr("class", "heatmap-chart-area");


    // Add sorting controls for interactivity

    const controls = chartArea
        .append("div")
        .attr("class", "heatmap-controls");

    controls.append("label")
        .attr("for", "family-sort")
        .text("Sort families:");

    const sortSelect = controls
        .append("select")
        .attr("id", "family-sort");

    sortSelect.selectAll("option")
        .data([
            {
                value: "threatened",
                label: "Highest threatened percentage"
            },
            {
                value: "alphabetical",
                label: "Alphabetically"
            }
        ])
        .join("option")
        .attr("value", d => d.value)
        .text(d => d.label);


    // Create the SVG

    const chartHeight =
        heatmapMargin.top +
        heatmapMargin.bottom +
        familyData.length * (cellHeight + cellGap);

    const svg = chartArea
        .append("svg")
        .attr("viewBox",
            `0 0 ${heatmapWidth} ${chartHeight}`
        )
        .attr("width", "100%")
        .attr("role", "img")
        .attr("aria-label",
            "Heatmap showing the percentage distribution of IUCN conservation categories across parrot families."
        );

    const chart = svg.append("g")
        .attr("transform",
            `translate(${heatmapMargin.left},${heatmapMargin.top})`
        );


    // Create the scales

    const xScale = d3.scaleBand()
        .domain(conservationCategories)
        .range([0, heatmapInnerWidth])
        .padding(0.08);

    const yScale = d3.scaleBand()
        .domain(familyData.map(d => d.family))
        .range([
            0,
            familyData.length * (cellHeight + cellGap)
        ])
        .padding(0.08);


    // Add the x-axis

    chart.append("g")
        .attr("class", "heatmap-x-axis")
        .call(
            d3.axisTop(xScale)
                .tickFormat(d => d)
        );


    // Add the y-axis

    const yAxis = chart.append("g")
        .attr("class", "heatmap-y-axis")
        .call(d3.axisLeft(yScale));

    yAxis.selectAll("text")
        .style("font-size", "12px");


    // Create the tooltip

    const tooltip = d3.select("body")
        .append("div")
        .attr("class", "heatmap-tooltip")
        .style("opacity", 0);


    // Prepare heatmap cells

    const cells = familyData.flatMap(family =>
        conservationCategories.map(category => ({
            family: family.family,
            category: category,
            count: family.categoryCounts[category],
            percentage: family.categoryPercentages[category],
            total: family.total
        }))
    );


    // Draw the heatmap

    const cellGroups = chart.selectAll(".heatmap-cell")
        .data(cells)
        .join("g")
        .attr("class", "heatmap-cell")
        .attr("transform", d =>
            `translate(
                ${xScale(d.category)},
                ${yScale(d.family)}
            )`
        );

    // Cell rectangles
    cellGroups.append("rect")
        .attr("width", xScale.bandwidth())
        .attr("height", yScale.bandwidth())
        .attr("rx", 4)
        .attr("fill", d =>
            heatmapColor(d.percentage)
        )
        .attr("stroke", "#FFFFFF")
        .attr("stroke-width", 1)
        .style("cursor", "pointer")

        // Hover effect
        .on("mouseover", function(event, d) {

            d3.select(this)
                .attr("stroke", "#244B38")
                .attr("stroke-width", 2);

            tooltip
                .style("opacity", 1)
                .html(`
                    <strong>${d.family}</strong>
                    <br>
                    ${conservationLabels[d.category]}
                    (${d.category})
                    <br><br>
                    Species: ${d.count}
                    <br>
                    Total assessed: ${d.total}
                    <br>
                    Percentage: ${d.percentage.toFixed(1)}%
                `);

        })

        .on("mousemove", function(event) {

            tooltip
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 35) + "px");

        })

        .on("mouseout", function() {

            d3.select(this)
                .attr("stroke", "#FFFFFF")
                .attr("stroke-width", 1);

            tooltip.style("opacity", 0);

        });


    // Add percentages within cells

    cellGroups.append("text")
        .attr("x", xScale.bandwidth() / 2)
        .attr("y", yScale.bandwidth() / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .attr("class", "heatmap-cell-label")
        .style("pointer-events", "none")
        .style("fill", d =>
            d.percentage >= 45 ? "#FFFFFF" : "#244B38"
        )
        .text(d =>
            d.percentage >= 5
                ? `${Math.round(d.percentage)}%`
                : ""
        );


    // Add a color legend

    const legendWidth = 220;
    const legendHeight = 12;

    const legend = svg.append("g")
        .attr("class", "heatmap-legend")
        .attr("transform",
            `translate(${heatmapMargin.left},${chartHeight - 28})`
        );

    const gradient = svg.append("defs")
        .append("linearGradient")
        .attr("id", "heatmap-gradient");

    gradient.append("stop")
        .attr("offset", "0%")
        .attr("stop-color", heatmapColor(0));

    gradient.append("stop")
        .attr("offset", "100%")
        .attr("stop-color", heatmapColor(100));

    legend.append("rect")
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .attr("rx", 3)
        .attr("fill", "url(#heatmap-gradient)");

    legend.append("text")
        .attr("x", 0)
        .attr("y", 27)
        .text("0%");

    legend.append("text")
        .attr("x", legendWidth)
        .attr("y", 27)
        .attr("text-anchor", "end")
        .text("100%");

    legend.append("text")
        .attr("x", legendWidth + 18)
        .attr("y", 10)
        .text("Species within family");


    // Add dynamic sorting

    function updateHeatmap(sortType) {

        let sortedFamilies = [...familyData];

        if (sortType === "threatened") {

            sortedFamilies.sort((a, b) =>
                d3.descending(
                    a.threatenedPercentage,
                    b.threatenedPercentage
                )
            );

        } else {

            sortedFamilies.sort((a, b) =>
                d3.ascending(a.family, b.family)
            );

        }

        const familyOrder = sortedFamilies.map(d => d.family);

        yScale.domain(familyOrder);

        // Update row positions
        chart.select(".heatmap-y-axis")
            .transition()
            .duration(500)
            .call(d3.axisLeft(yScale));

        chart.selectAll(".heatmap-cell")
            .transition()
            .duration(500)
            .attr("transform", d =>
                `translate(
                    ${xScale(d.category)},
                    ${yScale(d.family)}
                )`
            );

    }

    sortSelect.on("change", function() {

        updateHeatmap(this.value);

    });

    // Apply the default sorting when the chart first loads
    updateHeatmap("threatened");


    // Error catching

    console.log("Heatmap successfully created!");

}).catch(error => {

    console.error("Error loading bird data:", error);

    heatmapContainer
        .append("p")
        .attr("class", "heatmap-error")
        .text(
            "Unable to load the bird dataset. Check the CSV path and file headers."
        );

});