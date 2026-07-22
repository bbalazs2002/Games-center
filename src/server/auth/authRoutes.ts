import { Router } from 'express';
import { InvalidInviteCodeError, redeemInviteCode } from './inviteCodes';
import { signToken } from './jwt';

export const authRouter = Router();

authRouter.post('/redeem-invite', async (req, res, next) => {
  const { code, displayName } = req.body as { code?: string; displayName?: string };

  if (!code?.trim() || !displayName?.trim()) {
    res.status(400).json({ error: 'A meghívó-kód és a név megadása kötelező.' });
    return;
  }

  try {
    const user = await redeemInviteCode(code.trim(), displayName.trim());
    const token = signToken({ userId: user.id, displayName: user.displayName });
    res.json({ token, user: { id: user.id, displayName: user.displayName } });
  } catch (error) {
    if (error instanceof InvalidInviteCodeError) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});
