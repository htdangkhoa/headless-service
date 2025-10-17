import { COMMANDS, DOMAINS, EVENTS } from '@/constants';

import { Command, Domain, DomainRegistry, DomainType, Event, PayloadType } from '../base';

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
    this.createBrowserIdCommand();
    this.createPageIdCommand();

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

    const LiveUrlParametersType: PayloadType = [
      {
        name: 'format',
        type: 'string',
        enum: ['jpeg', 'png'],
        optional: true,
      },
      {
        name: 'quality',
        type: 'number',
        optional: true,
      },
      {
        name: 'everyNthFrame',
        type: 'number',
        optional: true,
      },
      {
        name: 'webhook',
        type: 'object',
        properties: [
          {
            name: 'url',
            type: 'string',
          },
          {
            name: 'method',
            type: 'string',
            enum: ['GET', 'POST', 'PUT', 'DELETE'],
            optional: true,
          },
          {
            name: 'headers',
            type: 'object',
            optional: true,
          },
        ],
      },
    ];

    const LiveUrlCommand: Command = {
      name: COMMANDS.LIVE_URL,
      description: 'Get live URL',
      parameters: LiveUrlParametersType,
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
    const KeepAliveParametersType: PayloadType = [
      {
        name: 'ms',
        type: 'number',
        description: 'Milliseconds to keep alive',
      },
    ];

    const KeepAlivePayloadType: DomainType = {
      id: 'KeepAlivePayload',
      description: 'Payload for keepAlive command',
      type: 'object',
      properties: [
        {
          name: 'reconnectUrl',
          type: 'string',
        },
        {
          name: 'expiresAt',
          type: 'string',
        },
      ],
    };

    const keepAliveCommand: Command = {
      name: COMMANDS.KEEP_ALIVE,
      description: 'Keep alive',
      parameters: KeepAliveParametersType,
      returns: this.buildReturns(KeepAlivePayloadType),
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

  private createBrowserIdCommand() {
    const BrowserIdPayloadType: DomainType = {
      id: 'BrowserIdPayload',
      description: 'Payload for browserId command',
      type: 'object',
      properties: [
        {
          name: 'browserId',
          type: 'string',
        },
      ],
    };

    const browserIdCommand: Command = {
      name: COMMANDS.BROWSER_ID,
      description: 'Get browser ID',
      returns: this.buildReturns(BrowserIdPayloadType),
    };

    this.addDomainType(BrowserIdPayloadType);
    this.addCommand(browserIdCommand);
  }

  private createPageIdCommand() {
    const PageIdPayloadType: DomainType = {
      id: 'PageIdPayload',
      description: 'Payload for pageId command',
      type: 'object',
      properties: [
        {
          name: 'pageId',
          type: 'string',
        },
      ],
    };

    const pageIdCommand: Command = {
      name: COMMANDS.PAGE_ID,
      description: 'Get page ID',
      returns: this.buildReturns(PageIdPayloadType),
    };

    this.addDomainType(PageIdPayloadType);
    this.addCommand(pageIdCommand);
  }
}
