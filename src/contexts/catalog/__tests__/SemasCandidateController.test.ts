import { Pool } from 'pg';
import { Request, Response } from 'express';
import { SemasCandidateController, matchesSemas } from '../interface/SemasCandidateController';

const candidate = { name: '봄네일', branch: '서초점', road_address: '서울 서초구 사임당로1길 24 101호',
  latitude: 37.488, longitude: 127.011, verified_place_id: null, checked_at: null };
const place = { id: '123456',url: 'https://m.place.naver.com/place/123456/home',name: '봄 네일 서초점',
  roadAddress: '서울특별시 서초구 사임당로1길 24',latitude: 37.4881,longitude: 127.011,sourceCategory: '네일아트,네일샵' };
const body = { publicId:'MA0101202209A0045844', identityKey:'1'.repeat(64), observedAt:new Date().toISOString(), outcome:'verified',place };
function response() {
  return { set:jest.fn().mockReturnThis(), json:jest.fn(), status:jest.fn().mockReturnThis() } as unknown as Response;
}

test('branch, building and coordinates each matter for a definite match', () => {
  expect(matchesSemas(candidate,place)).toBe(true);
  expect(matchesSemas(candidate,{...place,name:'봄네일 강남점'})).toBe(false);
  expect(matchesSemas(candidate,{...place,roadAddress:'서울 서초구 사임당로1길 240'})).toBe(false);
  expect(matchesSemas(candidate,{...place,latitude:37.5})).toBe(false);
});
test('rejects a mismatched Place identity before opening a DB transaction', async () => {
  const db={connect:jest.fn()}, next=jest.fn();
  await new SemasCandidateController(db as unknown as Pool).record(
    {body:{...body,place:{...place,url:'https://m.place.naver.com/place/678901/home'}}} as Request,response(),next);
  expect(next).toHaveBeenCalledWith(expect.any(Error)); expect(db.connect).not.toHaveBeenCalled();
});
test('late or repeated observation and inactive identities do not replace a verified place', async () => {
  for(const row of [{...candidate,verified_place_id:'123456'},{...candidate,checked_at:new Date(Date.now()+1000)},null]) {
    const query=jest.fn(async (sql:string) => ({rows:sql.startsWith('SELECT name') && row ? [row]:[]}));
    const db={connect:async()=>({query,release:jest.fn()})}, res=response();
    await new SemasCandidateController(db as unknown as Pool).record({body} as Request,res,jest.fn());
    expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
    expect(res.json).toHaveBeenCalledWith({applied:false});
  }
});
