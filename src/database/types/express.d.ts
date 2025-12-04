import { typeTokenData } from './userlogin';

declare global {
  namespace Express {
    interface Request {
      tokenData?: typeTokenData;
    }
  }
}