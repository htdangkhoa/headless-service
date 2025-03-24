// ref: https://source.chromium.org/chromium/chromium/src/+/main:third_party/inspector_protocol/crdtp/dispatch.h?q=%22-32601%22&ss=chromium%2Fchromium%2Fsrc:third_party%2F
export enum DispatchCode {
  SUCCESS = 1,
  FALL_THROUGH = 2,
  // For historical reasons, these error codes correspond to commonly used
  // XMLRPC codes (e.g. see METHOD_NOT_FOUND in
  // https://github.com/python/cpython/blob/main/Lib/xmlrpc/client.py).
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  SERVER_ERROR = -32000,
  SESSION_NOT_FOUND = SERVER_ERROR - 1,
}

export class DispatchResponse {
  constructor(
    readonly code: DispatchCode,
    readonly message: string = ''
  ) {}

  get isSuccess() {
    return this.code === DispatchCode.SUCCESS;
  }

  get isFallThrough() {
    return this.code === DispatchCode.FALL_THROUGH;
  }

  get isError() {
    return this.code < DispatchCode.SUCCESS;
  }

  public static Success() {
    return new DispatchResponse(DispatchCode.SUCCESS);
  }

  public static FallThrough() {
    return new DispatchResponse(DispatchCode.FALL_THROUGH);
  }

  public static ParseError(message: string) {
    return new DispatchResponse(DispatchCode.PARSE_ERROR, message);
  }

  public static InvalidRequest(message: string) {
    return new DispatchResponse(DispatchCode.INVALID_REQUEST, message);
  }

  public static MethodNotFound(message: string) {
    return new DispatchResponse(DispatchCode.METHOD_NOT_FOUND, message);
  }

  public static InvalidParams(message: string) {
    return new DispatchResponse(DispatchCode.INVALID_PARAMS, message);
  }

  public static InternalError(message?: string) {
    return new DispatchResponse(DispatchCode.INTERNAL_ERROR, message);
  }

  public static ServerError(message: string) {
    return new DispatchResponse(DispatchCode.SERVER_ERROR, message);
  }

  public static SessionNotFound(message: string) {
    return new DispatchResponse(DispatchCode.SESSION_NOT_FOUND, message);
  }
}
