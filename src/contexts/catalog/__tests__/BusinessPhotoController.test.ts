import { S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { Request, Response } from 'express';
import { Pool } from 'pg';
import { BusinessPhotoController, businessPhotoBytes } from '../interface/BusinessPhotoController';

const jpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCADwAPADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCe4C6jgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//Z';
const bytes = Buffer.from(jpeg,'base64');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const body = {shopId:'123',sourceUrl:'https://ldb-phinf.pstatic.net/photo.jpg',attempts:0,outcome:'archive',sha256,jpeg};
const metadata = {'shop-id':'123','naver-place-url':'https://m.place.naver.com/place/123/home',source:'place-business',
  'review-status':'pending_review',sha256};
const head = {Metadata:metadata,ContentType:'image/jpeg',ContentLength:bytes.length};

async function record(query: jest.Mock, send: jest.Mock, payload: Record<string,unknown> = body) {
  const next = jest.fn(), json = jest.fn();
  const ctrl = new BusinessPhotoController({query} as unknown as Pool,{send} as unknown as S3Client);
  await ctrl.record({body:payload} as Request,{json} as unknown as Response,next);
  return {next,json};
}

const originalBucket = process.env.S3_MARKETING_BUCKET;
beforeEach(() => { process.env.S3_MARKETING_BUCKET = 'private-bucket'; });
afterAll(() => {
  if (originalBucket === undefined) delete process.env.S3_MARKETING_BUCKET;
  else process.env.S3_MARKETING_BUCKET = originalBucket;
});

test('checks JPEG encoding, SHA and baseline frame before accepting bytes', () => {
  expect(businessPhotoBytes(jpeg,sha256)).toEqual(bytes);
  for (const value of [jpeg + ' ', 'abc', Buffer.from('fake').toString('base64')]) {
    expect(() => businessPhotoBytes(value,sha256)).toThrow();
  }
  expect(() => businessPhotoBytes(jpeg,'f'.repeat(64))).toThrow();
});

test.each([false,true])('verifies a conditional new or preexisting object before saving (existing=%s)', async exists => {
  const query = jest.fn().mockResolvedValue({rowCount:1});
  const send = jest.fn();
  if (exists) send.mockRejectedValueOnce({$metadata:{httpStatusCode:412}});
  else send.mockResolvedValueOnce({});
  send.mockResolvedValueOnce(head);
  const {next,json} = await record(query,send);
  expect(next).not.toHaveBeenCalled();
  expect(json).toHaveBeenCalledWith({status:'archived'});
  const key = 'catalog-portfolios/pending_review/place/123/' + sha256 + '.jpg';
  expect(send.mock.calls[0][0].input).toMatchObject({Bucket:'private-bucket',Key:key,IfNoneMatch:'*',Metadata:metadata});
  expect(send.mock.calls[1][0].input).toEqual({Bucket:'private-bucket',Key:key});
  expect(query.mock.calls[1][1]).toEqual(['123',body.sourceUrl,0,'private-bucket',key,sha256]);
});

test('stale queue and incompatible S3 state never update the archive record', async () => {
  const query = jest.fn().mockResolvedValue({rowCount:0}), send = jest.fn();
  expect((await record(query,send)).json).toHaveBeenCalledWith({status:'skipped'});
  expect(send).not.toHaveBeenCalled();
  query.mockClear().mockResolvedValue({rowCount:1});
  send.mockResolvedValueOnce({}).mockResolvedValueOnce({...head,Metadata:{...metadata,'shop-id':'999'}});
  expect((await record(query,send)).next).toHaveBeenCalledWith(expect.any(Error));
  expect(query).toHaveBeenCalledTimes(1);
});

test('only eligible intake can be updated, retry bookkeeping is conditional on its attempt',async () => {
  const query = jest.fn().mockResolvedValue({rowCount:1}),send=jest.fn();
  expect((await record(query,send,{...body,outcome:'unavailable'})).json).toHaveBeenCalledWith({status:'recorded'});
  expect(query.mock.calls[0][0]).toContain('p.attempts=$3');
  expect(send).not.toHaveBeenCalled();
  const {next} = await record(query,send,{...body,sourceUrl:'https://unrelated.invalid/test'});
  expect(next).toHaveBeenCalledWith(expect.any(Error));
});

test('public image proxy withholds pending and approved private portfolio keys', async () => {
  const { AdminController } = await import('../../admin/interface/AdminController');
  const s3 = await import('../../admin/infrastructure/S3Service');
  const sign = jest.spyOn(s3,'s3PresignGet').mockResolvedValue('https://example.invalid/signed');
  const admin = new AdminController({} as Pool);
  for (const key of ['catalog-portfolios/pending_review/place/123/file.jpg',
    '/catalog-portfolios//./pending_review/instagram/123/file.jpg', './catalog-portfolios/instagram/123/file.jpg']) {
    const res = {status:jest.fn().mockReturnThis(),end:jest.fn(),redirect:jest.fn()} as unknown as Response;
    await admin.imgProxy({params:{0:key}} as unknown as Request,res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.redirect).not.toHaveBeenCalled();
  }
  expect(sign).not.toHaveBeenCalled();
  const res = {setHeader:jest.fn(),redirect:jest.fn()} as unknown as Response;
  await admin.imgProxy({params:{0:'shops/photo.jpg'}} as unknown as Request,res);
  expect(sign).toHaveBeenCalledWith('shops/photo.jpg',3600);
  sign.mockRestore();
});
