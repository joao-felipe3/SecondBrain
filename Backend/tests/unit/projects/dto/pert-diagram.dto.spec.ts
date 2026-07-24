import {
  PertDiagramNode,
  PertDiagramEdge,
  PertDiagramStatistics,
  PackageCriticalityDto,
  PertDiagramDataResponse,
} from '@src/projects/dto/pert-diagram.dto';

describe('PertDiagramDto', () => {
  it('should instantiate DTO classes correctly', () => {
    const node = new PertDiagramNode();
    node.id = 't1';
    node.name = 'Task 1';
    node.durationHours = 2;
    node.earlyStart = 0;
    node.earlyFinish = 2;
    node.lateStart = 0;
    node.lateFinish = 2;
    node.slack = 0;
    node.isCritical = true;
    node.progress = 0;
    node.isConcluded = false;
    node.priority = 1;
    node.x = 100;
    node.y = 100;

    expect(node.id).toBe('t1');

    const edge = new PertDiagramEdge();
    edge.id = 'e1';
    edge.source = 't1';
    edge.target = 't2';
    edge.relationship = 'finish-to-start';
    edge.isAutoIdentified = true;
    edge.isCriticalEdge = true;

    expect(edge.id).toBe('e1');

    const stats = new PertDiagramStatistics();
    stats.totalTasks = 2;
    stats.criticalTasks = 1;
    stats.criticalPercent = 50;
    stats.totalEdges = 1;
    stats.maxParallelism = 2;

    expect(stats.totalTasks).toBe(2);

    const pkg = new PackageCriticalityDto();
    pkg.packageId = 'p1';
    pkg.taskCount = 5;
    pkg.criticalTaskCount = 2;
    pkg.criticalRatio = 0.4;
    pkg.minSlack = 0;
    pkg.criticalDuration = 10;
    pkg.criticalPathTaskCount = 2;
    pkg.score = 80;

    expect(pkg.packageId).toBe('p1');

    const resp = new PertDiagramDataResponse();
    resp.projectId = 'proj1';
    resp.projectName = 'Test Project';
    resp.projectDurationHours = 20;
    resp.nodes = [node];
    resp.edges = [edge];
    resp.criticalPath = ['t1'];
    resp.alerts = [];
    resp.statistics = stats;

    expect(resp.projectId).toBe('proj1');
  });
});
