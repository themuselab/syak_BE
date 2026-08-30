import appleSignin from 'apple-signin-auth';
import { ISocialAuthProvider } from '../ports/ISocialAuthProvider';
import { SocialProfile } from '../domain/User';

export class AppleAuthProvider implements ISocialAuthProvider {
  async getProfile(identityToken: string): Promise<SocialProfile> {
    // id_token의 aud(client_id) = 웹 Services ID / 앱 번들 ID. (Team ID 아님!)
    // 사장님 웹(Services ID)과 소비자 앱(번들 ID) 둘 다 허용.
    const aud = [process.env.APPLE_SERVICES_ID, process.env.APPLE_BUNDLE_ID].filter(Boolean) as string[];
    const payload = await appleSignin.verifyIdToken(identityToken, {
      audience: aud.length === 1 ? aud[0] : aud,
      ignoreExpiration: false,
    });
    return {
      provider: 'apple',
      socialId: payload.sub,
      nickname: null,      // 애플 id_token엔 이름 없음(최초 form_post에만) → 이후 프로필에서 입력
      profileImage: null,  // 애플은 프로필 이미지 미제공
    };
  }

  // 웹 authorize(redirect) 플로우: code → id_token 교환.
  // 애플은 client_secret을 .p8(개인키)로 즉석 서명한 JWT로 만든다(Services ID·Team ID·Key ID 필요).
  // 반환한 id_token은 use case가 다시 getProfile로 검증한다.
  async exchangeCode(code: string, redirectUri: string): Promise<string> {
    const clientID = process.env.APPLE_SERVICES_ID;
    const teamID = process.env.APPLE_TEAM_ID;
    const keyIdentifier = process.env.APPLE_KEY_ID;
    const privateKey = process.env.APPLE_PRIVATE_KEY;
    if (!clientID || !teamID || !keyIdentifier || !privateKey) {
      throw new Error('APPLE_SERVICES_ID/TEAM_ID/KEY_ID/PRIVATE_KEY 미설정');
    }
    const clientSecret = appleSignin.getClientSecret({
      clientID, teamID, keyIdentifier,
      privateKey: privateKey.replace(/\\n/g, '\n'), // env에 \n 이스케이프로 들어온 경우 복원
    });
    const tokens = await appleSignin.getAuthorizationToken(code, {
      clientID, clientSecret, redirectUri,
    });
    if (!tokens.id_token) throw new Error('애플 토큰 교환 실패');
    return tokens.id_token;
  }
}
