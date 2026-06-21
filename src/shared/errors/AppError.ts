import { ErrorCode, ErrorCodeType, KoreanMessages } from './ErrorCode';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCodeType;
  public readonly details?: unknown;

  constructor(statusCode: number, code: ErrorCodeType, details?: unknown) {
    super(KoreanMessages[code]);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined && { details: this.details }),
    };
  }
}

// ── Named factories ────────────────────────────────────────────

export const Errors = {
  unauthorized:           (d?: unknown) => new AppError(401, ErrorCode.AUTH_UNAUTHORIZED, d),
  invalidToken:           (d?: unknown) => new AppError(401, ErrorCode.AUTH_INVALID_TOKEN, d),
  tokenExpired:           (d?: unknown) => new AppError(401, ErrorCode.AUTH_TOKEN_EXPIRED, d),
  socialLoginFailed:      (d?: unknown) => new AppError(400, ErrorCode.AUTH_SOCIAL_FAILED, d),
  refreshInvalid:         (d?: unknown) => new AppError(401, ErrorCode.AUTH_REFRESH_INVALID, d),
  shopNotFound:           (d?: unknown) => new AppError(404, ErrorCode.SHOP_NOT_FOUND, d),
  slotNotFound:           (d?: unknown) => new AppError(404, ErrorCode.SLOT_NOT_FOUND, d),
  favoriteExists:         (d?: unknown) => new AppError(409, ErrorCode.FAVORITE_ALREADY_EXISTS, d),
  favoriteNotFound:       (d?: unknown) => new AppError(404, ErrorCode.FAVORITE_NOT_FOUND, d),
  notificationSettingsNotFound: (d?: unknown) => new AppError(404, ErrorCode.NOTIFICATION_SETTINGS_NOT_FOUND, d),
  validation:             (d?: unknown) => new AppError(400, ErrorCode.VALIDATION_ERROR, d),
  notFound:               (d?: unknown) => new AppError(404, ErrorCode.NOT_FOUND, d),
  forbidden:              (d?: unknown) => new AppError(403, ErrorCode.FORBIDDEN, d),
  internalKeyInvalid:     (d?: unknown) => new AppError(403, ErrorCode.INTERNAL_KEY_INVALID, d),
  internal:               (d?: unknown) => new AppError(500, ErrorCode.INTERNAL_ERROR, d),
  ownerUnauthorized:      (d?: unknown) => new AppError(401, ErrorCode.OWNER_UNAUTHORIZED, d),
  ownerNotFound:          (d?: unknown) => new AppError(404, ErrorCode.OWNER_NOT_FOUND, d),
  partnerCodeInvalid:     (d?: unknown) => new AppError(400, ErrorCode.PARTNER_CODE_INVALID, d),
  partnerCodeExpired:     (d?: unknown) => new AppError(400, ErrorCode.PARTNER_CODE_EXPIRED, d),
  partnerCodeUsed:        (d?: unknown) => new AppError(409, ErrorCode.PARTNER_CODE_USED, d),
  shopAlreadyLinked:      (d?: unknown) => new AppError(409, ErrorCode.SHOP_ALREADY_LINKED, d),
  slotForbidden:          (d?: unknown) => new AppError(403, ErrorCode.SLOT_FORBIDDEN, d),
  adminUnauthorized:      (d?: unknown) => new AppError(401, ErrorCode.ADMIN_UNAUTHORIZED, d),
};
