import type { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import UserLogin from '../database/models/userlogin';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT) || 465,
  secure: true,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

export class AccountController {
  static getAccount = async (req: Request, res: Response) => {
    const user = await UserLogin.findByPk(req.tokenData?.id, { attributes: { exclude: ['userpass'] } });
    if (!user) return res.status(404).json({ result: false, content: [], error: ['Usuario no encontrado'] });
    return res.json({ result: true, content: user, error: [] });
  };

  static requestPasswordCode = async (req: Request, res: Response) => {
    const user = await UserLogin.findByPk(req.tokenData?.id);
    if (!user?.usermail) return res.status(404).json({ result: false, content: [], error: ['Correo no encontrado'] });
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    user.verificationCode = code;
    user.verificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'U.E. Antonio Abreu <uejantonioabreu@gmail.com>',
      to: user.usermail,
      subject: 'Código para actualizar contraseña',
      html: `<p>Tu código de seguridad es: <strong>${code}</strong></p><p>Expira en 15 minutos.</p>`
    });
    return res.json({ result: true, content: { message: 'Código enviado al correo registrado' }, error: [] });
  };

  static resetPassword = async (req: Request, res: Response) => {
    const { code, newPassword, confirmPassword } = req.body;
    if (!code || !newPassword || newPassword !== confirmPassword || newPassword.length < 6) {
      return res.status(400).json({ result: false, content: [], error: ['Código o contraseña inválidos'] });
    }
    const user = await UserLogin.findByPk(req.tokenData?.id);
    if (!user || user.verificationCode !== String(code) || !user.verificationCodeExpires || user.verificationCodeExpires < new Date()) {
      return res.status(400).json({ result: false, content: [], error: ['Código inválido o expirado'] });
    }
    user.userpass = newPassword;
    user.verificationCode = null;
    user.verificationCodeExpires = null;
    await user.save();
    return res.json({ result: true, content: { message: 'Contraseña actualizada correctamente' }, error: [] });
  };
}
