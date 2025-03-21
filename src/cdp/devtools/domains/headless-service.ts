import { Command, Domain, DomainRegistry, DomainType } from '../base';

export class HeadlessServiceDomainRegistry extends DomainRegistry {
  constructor() {
    super('HeadlessService');
  }

  buildDomain(): Domain {
    this.createLiveUrlCommand();

    return {
      domain: 'HeadlessService',
      types: Array.from(this.types.values()),
      commands: Array.from(this.commands.values()),
      events: Array.from(this.events.values()),
    };
  }

  private createLiveUrlCommand() {
    const LiveUrlPayloadType: DomainType = {
      id: 'LiveUrlPayload',
      description: 'Payload for liveURL command',
      type: 'object',
      properties: [
        {
          name: 'liveURL',
          type: 'string',
        },
      ],
    };

    const LiveUrlCommand: Command = {
      name: 'liveURL',
      description: 'Get live URL',
      returns: this.buildReturns(LiveUrlPayloadType),
    };

    this.addDomainType(LiveUrlPayloadType);
    this.addCommand(LiveUrlCommand);
  }
}
