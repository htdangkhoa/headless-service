import { HeadlessServerContext } from '@/router';
import { JSONListGetRoute } from '../list/get';

export class JSONGetRoute extends JSONListGetRoute {
  path = '/';

  constructor(serverContext: HeadlessServerContext) {
    super(serverContext);

    this.swagger = {
      ...this.swagger,
      summary: this.path,
    };
  }
}
