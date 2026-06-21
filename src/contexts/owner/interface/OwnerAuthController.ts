import { Request, Response, NextFunction, CookieOptions } from 'express';
import { OwnerSocialLoginUseCase } from '../application/OwnerSocialLoginUseCase';
import { LinkShopByCodeUseCase } from '../application/LinkShopByCodeUseCase';
import { RefreshOwnerTokenUseCase } from '../application/RefreshOwnerTokenUseCase';
import { SignOutOwnerUseCase } from '../application/SignOutOwnerUseCase';
import { SocialProvider, OwnerToken } from '../domain/Owner';
import { Errors } from '../../../shared/errors/AppError';
import { getAdminSSE } from '../../admin/infrastructure/AdminSSEService';

const ACCESS_MAX_AGE  = 15 * 60 * 1000;
const REFRESH_MAX_AGE = 24 * 60 * 60 * 1000;
const VALID_PROVIDERS: SocialProvider[] = ['kakao', 'naver', 'apple'];

export class OwnerAuthController {
  constructor(
    private readonly socialLogin: OwnerSocialLoginUseCase,
    private readonly linkShop: LinkShopByCodeUseCase,
    private readonly refreshToken: RefreshOwnerTokenUseCase,
    private readonly signOut: SignOutOwnerUseCase,
  ) {}

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const provider = req.params.provider as SocialProvider;
    if (!VALID_PROVIDERS.includes(provider)) {
      return next(Errors.validation({ provider: '지원하지 않는 소셜 로그인 방식입니다' }));
    }
    const { access_token } = req.body;
    if (!access_token) {
      return next(Errors.validation({ access_token: 'access_token이 필요합니다' }));
    }
    try {
      const result = await this.socialLogin.execute(provider, access_token);
      this.setCookies(res, result.token);
      if (result.isNewOwner) void getAdminSSE()?.pushNow();
      res.status(result.isNewOwner ? 201 : 200).json({
        owner: result.owner,
        shopLinked: !!result.owner.shopId,
        isNewOwner: result.isNewOwner,
      });
    } catch (err) {
      next(err);
    }
  };

  linkByCode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return next(Errors.validation({ code: '인증코드가 필요합니다' }));
    }
    try {
      const result = await this.linkShop.execute(req.owner!.sub, code);
      this.setCookies(res, result.token);
      void getAdminSSE()?.pushNow(); // 샵 연동 즉시 관리자 대시보드 갱신
      res.json({ shopId: result.shopId });
    } catch (err) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = req.cookies?.syak_owner_refresh as string | undefined;
    if (!token) return next(Errors.refreshInvalid());
    try {
      const tokens = await this.refreshToken.execute(token);
      this.setCookies(res, tokens);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.signOut.execute(req.owner!.sub);
      this.clearCookies(res);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  me = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    res.json({ id: req.owner!.sub, shopId: req.owner!.shopId });
  };

  private cookieBase(): CookieOptions {
    return {
      httpOnly: true,
      secure:   process.env.COOKIE_SECURE === 'true',
      sameSite: (process.env.COOKIE_SAME_SITE ?? 'lax') as CookieOptions['sameSite'],
    };
  }

  private setCookies(res: Response, tokens: OwnerToken): void {
    const base = this.cookieBase();
    res.cookie('syak_owner_access', tokens.accessToken, { ...base, maxAge: ACCESS_MAX_AGE });
    res.cookie('syak_owner_refresh', tokens.refreshToken, {
      ...base,
      maxAge: REFRESH_MAX_AGE,
      path: '/api/v1/owner/auth/token/refresh',
    });
  }

  private clearCookies(res: Response): void {
    const base = this.cookieBase();
    res.clearCookie('syak_owner_access', base);
    res.clearCookie('syak_owner_refresh', { ...base, path: '/api/v1/owner/auth/token/refresh' });
  }
}
