import { COMMANDS, DOMAINS, EVENTS } from '@/constants';
import { Event, Command, Domain, DomainRegistry, DomainType } from '../base';

export class HeadlessServiceDomainRegistry extends DomainRegistry {
  constructor() {
    super('HeadlessService');
  }

  buildDomain(): Domain {
    /* Register commands */
    this.createLiveUrlCommand();
    this.createRecordingCommand();
    this.createKeepAliveCommand();
    this.createDebuggerUrlCommand();

    /* Register events */
    this.createLiveCompleteEvent();

    return {
      domain: DOMAINS.HEADLESS_SERVICE,
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
      name: COMMANDS.LIVE_URL,
      description: 'Get live URL',
      returns: this.buildReturns(LiveUrlPayloadType),
    };

    this.addDomainType(LiveUrlPayloadType);
    this.addCommand(LiveUrlCommand);
  }

  private createLiveCompleteEvent() {
    const LiveCompleteEvent: Event = {
      name: EVENTS.LIVE_COMPLETE,
      description: 'Emit the screencast is stopped',
    };

    this.addEvent(LiveCompleteEvent);
  }

  private createRecordingCommand() {
    const startRecordingCommand: Command = {
      name: COMMANDS.START_RECORDING,
      description: 'Start recording',
    };

    const stopRecordingCommand: Command = {
      name: COMMANDS.STOP_RECORDING,
      description: 'Stop recording',
    };

    this.addCommand(startRecordingCommand, stopRecordingCommand);
  }

  private createKeepAliveCommand() {
    const keepAliveCommand: Command = {
      name: COMMANDS.KEEP_ALIVE,
      description: 'Keep alive',
      parameters: [
        {
          name: 'ms',
          type: 'number',
          description: 'Milliseconds to keep alive',
        },
      ],
      returns: [
        {
          name: 'reconnectUrl',
          type: 'string',
        },
      ],
    };

    this.addCommand(keepAliveCommand);
  }

  private createDebuggerUrlCommand() {
    const DebuggerUrlPayloadType: DomainType = {
      id: 'DebuggerUrlPayload',
      description: 'Payload for debuggerUrl command',
      type: 'object',
      properties: [
        {
          name: 'webSocketDebuggerUrl',
          type: 'string',
        },
        {
          name: 'devtoolsFrontendUrl',
          type: 'string',
        },
      ],
    };

    const debuggerUrlCommand: Command = {
      name: COMMANDS.DEBUGGER_URL,
      description: 'Get debugger URL',
      returns: this.buildReturns(DebuggerUrlPayloadType),
    };

    this.addDomainType(DebuggerUrlPayloadType);
    this.addCommand(debuggerUrlCommand);
  }
}
