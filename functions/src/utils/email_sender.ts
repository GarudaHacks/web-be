import { transporter } from "../config/firebase";
import { resetPassword } from "../templates/resetPassword";
import { welcomeEmail } from "../templates/welcomeEmail";
import { applicationSubmitted } from "../templates/applicationSubmitted";
import * as functions from "firebase-functions";

export async function sendResetPasswordEmail(to: string, passwordResetLink: string) {
    const html = resetPassword({ actionUrl: passwordResetLink });
    const info = await transporter.sendMail({
        from: process.env.SES_FROM_EMAIL,
        to,
        subject: 'Reset Your Password',
        html,
    });
    functions.logger.info('Reset password email sent:', info.messageId);
}

export async function sendEmailVerificationEmail(to: string, verificationLink: string) {
    const html = welcomeEmail({ actionUrl: verificationLink });
    const info = await transporter.sendMail({
        from: process.env.SES_FROM_EMAIL,
        to,
        subject: 'Welcome to Garuda Hacks 🦅',
        html,
    });
    functions.logger.info('Verification email sent:', info.messageId);
}

export async function sendApplicationSubmittedEmail(to: string) {
    const html = applicationSubmitted();
    const info = await transporter.sendMail({
        from: process.env.SES_FROM_EMAIL,
        to,
        subject: 'Application Submitted - Garuda Hacks 7.0',
        html,
    });
    functions.logger.info('Application submitted email sent:', info.messageId);
}