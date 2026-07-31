export function buildResourceTree(filteredResources, isGroupView, expandedRowIds) {
  if (!isGroupView) {
    return filteredResources.map(r => ({ ...r, _level: 0, _isExpandable: false }));
  }

  // 1. Build a map of all filtered resources
  const resourceMap = new Map();
  filteredResources.forEach(r => {
    resourceMap.set(r.resource_id, { ...r, children: [] });
  });

  // 2. Assign children to parents
  const roots = [];
  resourceMap.forEach(r => {
    let resolvedParentId = r.parent_resource_id;

    // Dynamically link ASGs to their parent ECS Service
    if (r.service_type?.toUpperCase() === 'ASG') {
      const asgName = r.resource_name || r.name || r.resource_id;
      const parentEcs = filteredResources.find(p => p.service_type?.toUpperCase() === 'ECS' && 
        (p.instance_spec?.includes(`ASG: ${r.resource_id}`) || p.instance_spec?.includes(`ASG: ${asgName}`))
      );
      if (parentEcs) {
        resolvedParentId = parentEcs.resource_id;
      }
    }

    // If the parent is missing (e.g. ASG not tagged/discovered), see if an ECS Service claims it
    if (resolvedParentId && !resourceMap.has(resolvedParentId)) {
      const parentEcs = filteredResources.find(p => p.service_type?.toUpperCase() === 'ECS' && p.instance_spec?.includes(`ASG: ${resolvedParentId}`));
      if (parentEcs) {
        resolvedParentId = parentEcs.resource_id;
      }
    }

    if (resolvedParentId && resourceMap.has(resolvedParentId)) {
      resourceMap.get(resolvedParentId).children.push(r);
    } else {
      roots.push(r);
    }
  });

  // 3. Flatten the tree based on expandedRowIds
  const flattenTree = (nodes, level = 0) => {
    let result = [];
    for (const node of nodes) {
      const isExpandable = node.children.length > 0;
      const isExpanded = expandedRowIds.has(node.resource_id);
      result.push({ ...node, _level: level, _isExpandable: isExpandable, _isExpanded: isExpanded });
      
      if (isExpanded && isExpandable) {
        result = result.concat(flattenTree(node.children, level + 1));
      }
    }
    return result;
  };

  return flattenTree(roots);
}
