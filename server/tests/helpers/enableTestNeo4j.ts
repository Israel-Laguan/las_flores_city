// M32: graph authoring is required for intake routes. Integration tests that
// exercise those routes need a reachable Neo4j (or a mocked Neo4jClient). This
// helper enables the graph with the project-local defaults so tests can hit the
// real service running in the dev compose/Podman environment.
process.env.NEO4J_ENABLED = 'true';
process.env.NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
process.env.NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
process.env.NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'lasfloresdev123';
