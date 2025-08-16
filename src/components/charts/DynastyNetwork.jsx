'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { useDataContext } from '@/context/DataContext';

const DynastyNetwork = () => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const {
    persons,
    relationships,
    setSelectedNode,
    selectedNode,
    updatePersonPosition
  } = useDataContext();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [gridSize, setGridSize] = useState(20);
  const [showGrid, setShowGrid] = useState(true);
  const simulationRef = useRef(null);
  const nodePositionsRef = useRef(new Map());
  const draggingRef = useRef(false);
  const zoomRef = useRef(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, k: 1 });

  const initialZoomApplied = useRef(false);
  const currentTransform = useRef(d3.zoomIdentity);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      const svg = d3.select(svgRef.current);
      zoomRef.current.scaleBy(svg.transition().duration(250), 1.2);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      const svg = d3.select(svgRef.current);
      zoomRef.current.scaleBy(svg.transition().duration(250), 0.8);
    }
  }, []);

  const handleResetZoom = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      const svg = d3.select(svgRef.current);
      const initialTransform = d3.zoomIdentity
        .translate(dimensions.width / 5, dimensions.height / 5)
        .scale(1.0);
      zoomRef.current.transform(svg.transition().duration(250), initialTransform);
    }
  }, [dimensions.width, dimensions.height]);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        console.log("dimensions: " + width + ", " + height);
        setDimensions({ width, height });
      }
    };

    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    updateDimensions();

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!persons.length) return;

    const positions = new Map();
    persons.forEach(person => {
      if (person.x != null && person.y != null) {
        positions.set(person.id, { x: person.x, y: person.y });
      }
    });
    nodePositionsRef.current = positions;
  }, [persons]);

  useEffect(() => {
    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
        simulationRef.current = null;
      }
    };
  }, []);

  // MAIN DRAW EFFECT (UPDATED)
  useEffect(() => {        
    if (!svgRef.current || !persons || persons.length === 0 || dimensions.width === 0 || dimensions.height === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Create container for zoomable content
    const container = svg.append('g').attr('class', 'zoom-container');

    // Add SVG definitions
    const defs = svg.append('defs');

    // Define arrow markers for parent-child relationships
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#94a3b8');

    // Define dot marker for marriage relationships
    defs.append('marker')
      .attr('id', 'marriage-dot')
      .attr('viewBox', '-4 -4 8 8')
      .attr('refX', 0)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .append('circle')
      .attr('r', 3)
      .attr('fill', '#f97316');

    // Define circle marker for succession relationships
    defs.append('marker')
      .attr('id', 'succession-circle')
      .attr('viewBox', '-5 -5 10 10')
      .attr('refX', 0)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .append('circle')
      .attr('r', 4)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 2);

    // Define square marker for sibling relationships
    defs.append('marker')
      .attr('id', 'sibling-square')
      .attr('viewBox', '-4 -4 8 8')
      .attr('refX', 0)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .append('rect')
      .attr('x', -3)
      .attr('y', -3)
      .attr('width', 6)
      .attr('height', 6)
      .attr('fill', '#8b5cf6');

    svg.on('click', (event) => {
      if (event.target === svg.node()) {
        setSelectedNode(null);
      }
    });

    if (showGrid) {
      const gridGroup = container.append('g').attr('class', 'grid');
      // Make grid larger for better panning experience
      const gridWidth = dimensions.width * 2;
      const gridHeight = dimensions.height * 2;
      
      for (let y = 0; y <= gridHeight; y += gridSize) {
        gridGroup.append('line')
          .attr('x1', 0).attr('y1', y).attr('x2', gridWidth).attr('y2', y)
          .attr('stroke', '#e5e7eb').attr('stroke-width', 0.5);
      }
      for (let x = 0; x <= gridWidth; x += gridSize) {
        gridGroup.append('line')
          .attr('x1', x).attr('y1', 0).attr('x2', x).attr('y2', gridHeight)
          .attr('stroke', '#e5e7eb').attr('stroke-width', 0.5);
      }
    }

    const posX = dimensions.width / 5;
    const posY = dimensions.height / 5;

    // Create nodes array from persons
    const nodes = persons.map(person => {
      const storedPos = nodePositionsRef.current.get(person.id);
      return storedPos ?
        { ...person, x: storedPos.x || posX, y: storedPos.y || posY } :
        {
          ...person,
          x: person.x || posX,
          y: person.y || posY
        };
    });

    const personMap = new Map(nodes.map(p => [p.id, p]));
    const resolvedRelationships = relationships.map(rel => ({
      ...rel,
      source: personMap.get(rel.source),
      target: personMap.get(rel.target)
    })).filter(rel => rel.source && rel.target);

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(resolvedRelationships).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('x', d3.forceX().strength(0.05))
      .force('y', d3.forceY().strength(0.05));

    simulationRef.current = simulation;

    // Create clip paths for each node
    const clipPaths = defs.selectAll('.node-clip')
      .data(nodes)
      .enter()
      .append('clipPath')
      .attr('id', d => `clip-${d.id}`)
      .attr('class', 'node-clip');

    clipPaths.append('circle')
      .attr('r', d => d.nodeSize || 40);

    const link = container.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(resolvedRelationships)
      .enter()
      .append('line')
      .attr('class', 'relationship')
      .attr('data-id', d => d.id)
      .attr('stroke', d =>
        d.color ||
        (d.type === 'marriage' ? '#f97316' :
          d.type === 'succession' ? '#10b981' :
            d.type === 'sibling' ? '#8b5cf6' :
              '#94a3b8')
      )
      .attr('stroke-width', d => d.width ||
        (d.type === 'sibling' ? 1.5 : 2)
      )
      .attr('stroke-dasharray', d => {
        if (d.type === 'marriage') return '5,5';
        return '0';
      })
      .attr('marker-end', d => {
        if (d.type === 'parent-child') return 'url(#arrow)';
        if (d.type === 'marriage') return 'url(#marriage-dot)';
        if (d.type === 'succession') return 'url(#succession-circle)';
        if (d.type === 'sibling') return 'url(#sibling-square)';
        return null;
      })
      .on('mouseover', function () { d3.select(this).attr('stroke-width', 4); })
      .on('mouseout', function (event, d) {
        d3.select(this).attr('stroke-width', d.width ||
          (d.type === 'sibling' ? 1.5 : 2)
        );
      })
      .on('click', function (event) {
        event.stopPropagation();
      });

    const drag = d3.drag()
      .on('start', function (event, d) {
        draggingRef.current = false;
        if (!event.active) simulation.alphaTarget(0.3).restart();

        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', function (event, d) {
        draggingRef.current = true;
        d.fx = event.x;
        d.fy = event.y;
        nodePositionsRef.current.set(d.id, { x: event.x, y: event.y });
      })
      .on('end', function (event, d) {
        if (draggingRef.current) {
          if (!event.active) simulation.alphaTarget(0);

          const finalX = d.fx;
          const finalY = d.fy;

          if (updatePersonPosition) {
            updatePersonPosition(d.id, finalX, finalY);
          }

          d.fx = finalX;
          d.fy = finalY;
          nodePositionsRef.current.set(d.id, { x: finalX, y: finalY });
        } else {
          setSelectedNode(d);
        }
      });

    // NODES AS GROUPS
    const node = container.append('g')
      .attr('class', 'nodes')
      .selectAll('g.node-group')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node node-group')
      .attr('data-id', d => d.id)
      .style('cursor', 'pointer')
      .call(drag)
      .on('click', function (event, d) {
        event.stopPropagation();
        if (!draggingRef.current) {
          setSelectedNode(d);
        }
      });

    // Add background circle
    node.append('circle')
      .attr('r', d => d.nodeSize || 40)
      .attr('fill', d => d.gender === 'male' ? '#3b82f6' : '#ec4899')
      .attr('class', d => `node-circle ${selectedNode && selectedNode.id === d.id ? 'selected' : ''}`)

    // Add image with profile link functionality
    const imageGroup = node.append('g')
      .attr('class', 'image-group')
      .on('click', function (event, d) {
        event.stopPropagation();
        if (d.profileUrl) {
          window.open(d.profileUrl, '_blank');
        }
      })
      .style('cursor', d => d.profileUrl ? 'pointer' : 'default');

    imageGroup.append('image')
      .attr('href', d => d.image || '')
      .attr('x', d => -(d.nodeSize || 40))
      .attr('y', d => -(d.nodeSize || 40))
      .attr('width', d => (d.nodeSize || 40) * 2)
      .attr('height', d => (d.nodeSize || 40) * 2)
      .attr('preserveAspectRatio', 'xMidYMid slice')
      .attr('clip-path', d => `url(#clip-${d.id})`)
      .attr('class', 'node-image')
      .on('error', function () {
        d3.select(this).attr('href', null);
      });

    imageGroup.append('title')
      .text(d => d.profileUrl ? 'View Profile' : 'No profile available');

    // Create a group for labels
    const labelGroup = container.append('g').attr('class', 'labels');

    // LABELS - MULTI-LINE WITH STYLING SUPPORT
    const labels = labelGroup.selectAll('g.node-label')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node-label')
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .attr('pointer-events', 'none');

    // Calculate vertical offsets based on node size
    labels.each(function (d) {
      const label = d3.select(this);
      const nodeSize = d.nodeSize || 40;
      const fontSize = d.labelFontSize || 12;
      const textColor = d.labelColor || '#334155';
      let verticalOffset = nodeSize + 15; // Start below the node

      // Add name (primary text) above node
      const nameText = label.append('text')
        .text(d.name || 'Unknown')
        .attr('text-anchor', 'middle')
        .attr('dy', -(nodeSize) - 10)
        .attr('font-size', fontSize)
        .attr('fill', textColor)
        .attr('font-weight', 'bold')
        .attr('class', d.profileUrl ? 'node-name node-link' : 'node-name')
        .style('pointer-events', 'auto')
        .style('cursor', d.profileUrl ? 'pointer' : 'default');

      if (d.profileUrl) {
        nameText
          .on('click', function (event) {
            event.stopPropagation();
            window.open(d.profileUrl, '_blank');
          })
          .append('title')
          .text('View Profile');
      }

      // Add title if available above node
      if (d.title) {
        label.append('text')
          .text(d.title)
          .attr('text-anchor', 'middle')
          .attr('dy', -(nodeSize) - 10 + fontSize * 1.5)
          .attr('font-size', fontSize * 0.9)
          .attr('fill', textColor)
          .attr('class', 'node-title');
      }

      // Add lifespan at bottom of node
      let lifespan = '';
      if (d.birth) lifespan += `${d.birth}`;
      if (d.age) lifespan += ` - (${d.age})`;

      if (lifespan) {
        label.append('text')
          .text(lifespan)
          .attr('text-anchor', 'middle')
          .attr('dy', verticalOffset)
          .attr('font-size', fontSize * 0.8)
          .attr('fill', textColor)
          .attr('class', 'node-age');

        // Add space after lifespan
        verticalOffset += fontSize * 0.8 * 1.5;
      }

      // Add description based on position setting
      if (d.description) {
        const maxWidth = d.descriptionWidth || nodeSize * 2;
        const position = d.descriptionPosition || 'below';

        if (position === 'below') {
          // Below position
          const foreignObj = label.append('foreignObject')
            .attr('x', -maxWidth / 2)
            .attr('y', verticalOffset)
            .attr('width', maxWidth)
            .attr('height', '100') // Fixed height for now
            .attr('class', 'node-description overflow-y-auto');

          const div = foreignObj.append('xhtml:div')
            .attr('class', 'text-center text-xs break-words leading-tight')
            .style('color', textColor)
            .style('font-size', `${fontSize * 0.8}px`)
            .style('font-family', 'sans-serif');

          const lines = d.description.split('\n');
          lines.forEach(line => {
            div.append('xhtml:p')
              .attr('class', 'm-0 p-0')
              .text(line);
          });
        } else {
          // Right position
          const xOffset = nodeSize + 20; // Start to the right of the node

          const foreignObj = label.append('foreignObject')
            .attr('x', xOffset)
            .attr('y', -nodeSize) // Align with top of node
            .attr('width', maxWidth)
            .attr('height', nodeSize * 2) // Height matches node height
            .attr('class', 'node-description overflow-y-auto');

          const div = foreignObj.append('xhtml:div')
            .attr('class', 'text-left text-xs break-words leading-tight h-full flex items-center')
            .style('color', textColor)
            .style('font-size', `${fontSize * 0.8}px`)
            .style('font-family', 'sans-serif');

          const lines = d.description.split('\n');
          lines.forEach(line => {
            div.append('xhtml:p')
              .attr('class', 'm-0 p-0')
              .text(line);
          });
        }
      }
    });

    // RELATIONSHIP LABELS
    const linkLabel = container.append('g')
      .attr('class', 'link-labels')
      .selectAll('text')
      .data(resolvedRelationships)
      .enter()
      .append('text')
      .text(d => d.label || ( // Use custom label if available
        d.type === 'parent-child' ? 'Child' :
          d.type === 'marriage' ? 'Marriage' :
            d.type === 'succession' ? 'Succession' :
              d.type === 'sibling' ? 'Sibling' : d.type
      ))
      .attr('font-size', 10)
      .attr('fill', d =>
        d.type === 'marriage' ? '#f97316' :
          d.type === 'succession' ? '#10b981' :
            d.type === 'sibling' ? '#8b5cf6' :
              '#4b5563'
      )
      .attr('pointer-events', 'none')
      .attr('class', 'node-relationship-labels');

    const snapToGrid = (value) => showGrid ? Math.round(value / gridSize) * gridSize : value;

    simulation.on('tick', () => {
      // Adjust link positions to account for node radii
      link
        .attr('x1', d => {
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const radius = d.source.nodeSize || 40;
          return snapToGrid(d.source.x + (dx / length) * radius);
        })
        .attr('y1', d => {
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const radius = d.source.nodeSize || 40;
          return snapToGrid(d.source.y + (dy / length) * radius);
        })
        .attr('x2', d => {
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const radius = d.target.nodeSize || 40;
          return snapToGrid(d.target.x - (dx / length) * radius);
        })
        .attr('y2', d => {
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const radius = d.target.nodeSize || 40;
          return snapToGrid(d.target.y - (dy / length) * radius);
        });

      // Position node groups (which contain both circle and image)
      node
        .attr('transform', d => `translate(${snapToGrid(d.x)},${snapToGrid(d.y)})`);

      // Position label groups
      labelGroup.selectAll('.node-label')
        .attr('transform', d => `translate(${snapToGrid(d.x)},${snapToGrid(d.y)})`);

      linkLabel
        .attr('x', d => snapToGrid((d.source.x + d.target.x) / 2))
        .attr('y', d => snapToGrid((d.source.y + d.target.y) / 2));
    });

    // Setup zoom behavior
    const zoomBehavior = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        setViewport(event.transform);
        currentTransform.current = event.transform;
        container.attr('transform', event.transform);
      });

    // Apply zoom behavior to SVG
    svg.call(zoomBehavior)
      .on('dblclick.zoom', null);

    // Apply initial transform only once
    if (!initialZoomApplied.current) {
      const initialTransform = d3.zoomIdentity
        .translate(dimensions.width / 5, dimensions.height / 5)
        .scale(1.0);
        
      svg.call(zoomBehavior.transform, initialTransform);
      initialZoomApplied.current = true;
    } else {
      // Apply current transform if it exists
      svg.call(zoomBehavior.transform, currentTransform.current);
    }

    zoomRef.current = zoomBehavior;

    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
        simulationRef.current = null;
      }
      svg.selectAll('*').remove();
    };
  }, [persons, relationships, dimensions, showGrid, gridSize, setSelectedNode, updatePersonPosition]);

  useEffect(() => {
    if (!svgRef.current || !persons.length) return;
    const svg = d3.select(svgRef.current);

    svg.selectAll('.node-circle')
      .classed('selected', d => selectedNode && d.id === selectedNode.id);
  }, [selectedNode, persons]);

  return (
    <div ref={containerRef} className="border rounded-lg overflow-hidden bg-gray-50 relative w-full h-full">
      {/* Floating zoom controls */}
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-2 bg-white p-2 rounded shadow">
        <button 
          onClick={handleZoomIn}
          className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 bg-white text-gray-700 font-bold hover:bg-gray-50 transition-colors"
          aria-label="Zoom In"
        >
          +
        </button>
        <button 
          onClick={handleZoomOut}
          className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 bg-white text-gray-700 font-bold hover:bg-gray-50 transition-colors"
          aria-label="Zoom Out"
        >
          -
        </button>
        <button 
          onClick={handleResetZoom}
          className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 bg-white text-gray-700 text-sm hover:bg-gray-50 transition-colors"
          aria-label="Reset Zoom"
        >
          ↺
        </button>
      </div>

      {/* Grid controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-2 bg-white p-2 rounded shadow">
        <div className="flex items-center">
          <input
            type="checkbox"
            id="gridToggle"
            checked={showGrid}
            onChange={() => setShowGrid(!showGrid)}
            className="h-4 w-4 text-blue-600 rounded"
          />
          <label htmlFor="gridToggle" className="ml-2 text-sm text-gray-700">
            Show Grid
          </label>
        </div>

        <div className="flex items-center">
          <label htmlFor="gridSize" className="text-sm text-gray-700 mr-2">
            Grid Size:
          </label>
          <select
            id="gridSize"
            value={gridSize}
            onChange={(e) => setGridSize(Number(e.target.value))}
            className="rounded border-gray-300 text-sm"
          >
            <option value="10">10px</option>
            <option value="20">20px</option>
            <option value="30">30px</option>
            <option value="40">40px</option>
            <option value="50">50px</option>
          </select>
        </div>
      </div>
      
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="cursor-move"
        onMouseDown={() => {
          if (svgRef.current) {
            svgRef.current.style.cursor = 'grabbing';
          }
        }}
        onMouseUp={() => {
          if (svgRef.current) {
            svgRef.current.style.cursor = 'move';
          }
        }}
      />
    </div>
  );
};

export default DynastyNetwork;