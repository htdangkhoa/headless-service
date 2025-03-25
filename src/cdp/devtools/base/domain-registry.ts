import { Command, Domain, DomainType, Event } from './protocol';

export abstract class DomainRegistry {
  protected types: Set<DomainType> = new Set();

  protected commands: Map<string, Command> = new Map();

  protected events: Map<string, Event> = new Map();

  constructor(private readonly domain: string) {}

  abstract buildDomain(): Domain;

  protected addDomainType(type: DomainType) {
    if (this.types.has(type)) {
      throw new Error(`Type ${type.id} already exists`);
    }

    this.types.add(type);
  }

  protected addCommand(...commands: Command[]) {
    for (const command of commands) {
      if (this.commands.has(command.name)) {
        throw new Error(`Command ${command.name} already exists`);
      }

      this.commands.set(command.name, command);
    }
  }

  protected addEvent(event: Event) {
    if (this.events.has(event.name)) {
      throw new Error(`Event ${event.name} already exists`);
    }

    this.events.set(event.name, event);
  }

  protected buildReturns(type: DomainType) {
    return [
      {
        name: 'result',
        $ref: type.id,
      },
    ];
  }
}
