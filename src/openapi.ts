import { OpenAPIRegistry, OpenApiGeneratorV3, RouteConfig } from '@asteasolutions/zod-to-openapi';
import fs from 'node:fs';

import { RouteGroup } from '@/route-group';

export class OpenAPI {
  private registry = new OpenAPIRegistry();

  constructor(private groups: RouteGroup[]) {}

  generateDocument(config: {
    title: string;
    version: string;
    jsonFileName: string;
    description?: string;
    servers?: { url: string }[];
  }) {
    this.groups.forEach((groupRouter) => {
      groupRouter.getRoutes().forEach(({ handlers, path, ...route }) => {
        const fullPath = (groupRouter.prefix ?? '') + path;

        this.registry.registerPath({
          ...(route as RouteConfig),
          path: fullPath,
        });
      });
    });

    const generator = new OpenApiGeneratorV3(this.registry.definitions);

    const docs = generator.generateDocument({
      openapi: '3.0.0',
      info: {
        title: config.title,
        version: config.version,
        description: config.description,
      },
      servers: config.servers,
    });
    fs.writeFileSync(config.jsonFileName, JSON.stringify(docs, null, 2));
  }
}
