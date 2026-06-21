export const ErrorCode = {
  // Auth (401/400)
  AUTH_INVALID_TOKEN:    'AUTH_INVALID_TOKEN',
  AUTH_TOKEN_EXPIRED:    'AUTH_TOKEN_EXPIRED',
  AUTH_UNAUTHORIZED:     'AUTH_UNAUTHORIZED',
  AUTH_SOCIAL_FAILED:    'AUTH_SOCIAL_FAILED',
  AUTH_REFRESH_INVALID:  'AUTH_REFRESH_INVALID',

  // Catalog (404)
  SHOP_NOT_FOUND:        'SHOP_NOT_FOUND',

  // Reservation (404)
  SLOT_NOT_FOUND:        'SLOT_NOT_FOUND',

  // Favorite (409/404)
  FAVORITE_ALREADY_EXISTS: 'FAVORITE_ALREADY_EXISTS',
  FAVORITE_NOT_FOUND:      'FAVORITE_NOT_FOUND',

  // Notification (404)
  NOTIFICATION_SETTINGS_NOT_FOUND: 'NOTIFICATION_SETTINGS_NOT_FOUND',

  // Owner (사장님)
  OWNER_UNAUTHORIZED:    'OWNER_UNAUTHORIZED',
  OWNER_NOT_FOUND:       'OWNER_NOT_FOUND',
  PARTNER_CODE_INVALID:  'PARTNER_CODE_INVALID',
  PARTNER_CODE_EXPIRED:  'PARTNER_CODE_EXPIRED',
  PARTNER_CODE_USED:     'PARTNER_CODE_USED',
  SHOP_ALREADY_LINKED:   'SHOP_ALREADY_LINKED',
  SLOT_FORBIDDEN:        'SLOT_FORBIDDEN',

  // Admin (관리자)
  ADMIN_UNAUTHORIZED:    'ADMIN_UNAUTHORIZED',

  // General
  VALIDATION_ERROR:      'VALIDATION_ERROR',
  NOT_FOUND:             'NOT_FOUND',
  INTERNAL_ERROR:        'INTERNAL_ERROR',
  FORBIDDEN:             'FORBIDDEN',
  INTERNAL_KEY_INVALID:  'INTERNAL_KEY_INVALID',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export const KoreanMessages: Record<ErrorCodeType, string> = {
  AUTH_INVALID_TOKEN:    '토큰이 유효하지 않습니다',
  AUTH_TOKEN_EXPIRED:    '토큰이 만료되었습니다. 다시 로그인해 주세요',
  AUTH_UNAUTHORIZED:     '로그인이 필요합니다',
  AUTH_SOCIAL_FAILED:    '소셜 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요',
  AUTH_REFRESH_INVALID:  '리프레시 토큰이 유효하지 않습니다. 다시 로그인해 주세요',
  SHOP_NOT_FOUND:        '해당 샵을 찾을 수 없습니다',
  SLOT_NOT_FOUND:        '예약 가능한 슬롯이 없습니다',
  FAVORITE_ALREADY_EXISTS: '이미 즐겨찾기에 추가된 샵입니다',
  FAVORITE_NOT_FOUND:    '즐겨찾기에 등록되지 않은 샵입니다',
  NOTIFICATION_SETTINGS_NOT_FOUND: '알림 설정을 찾을 수 없습니다',
  OWNER_UNAUTHORIZED:    '사장님 로그인이 필요합니다',
  OWNER_NOT_FOUND:       '사장님 계정을 찾을 수 없습니다',
  PARTNER_CODE_INVALID:  '유효하지 않은 인증코드입니다',
  PARTNER_CODE_EXPIRED:  '만료된 인증코드입니다',
  PARTNER_CODE_USED:     '이미 사용된 인증코드입니다',
  SHOP_ALREADY_LINKED:   '이미 연결된 샵이 있습니다',
  SLOT_FORBIDDEN:        '해당 슬롯에 대한 권한이 없습니다',
  ADMIN_UNAUTHORIZED:    '관리자 로그인이 필요합니다',
  VALIDATION_ERROR:      '요청 데이터가 올바르지 않습니다',
  NOT_FOUND:             '요청한 리소스를 찾을 수 없습니다',
  INTERNAL_ERROR:        '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요',
  FORBIDDEN:             '접근 권한이 없습니다',
  INTERNAL_KEY_INVALID:  '내부 API 키가 유효하지 않습니다',
};
