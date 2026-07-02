/* eslint-disable require-jsdoc */
import { transporter } from "../config/firebase";
import { resetPassword } from "../templates/resetPassword";
import { welcomeEmail } from "../templates/welcomeEmail";
import { applicationSubmitted } from "../templates/applicationSubmitted";
import { mentorshipBooked, MentorshipEmailProps } from "../templates/mentorshipBooked";
import { mentorshipCanceled } from "../templates/mentorshipCanceled";
import * as functions from "firebase-functions";


export async function sendResetPasswordEmail(to: string, passwordResetLink: string) {
  functions.logger.debug(`Sending reset password email to ${to}`)
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
  functions.logger.debug(`Sending verification email to ${to}`)
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
  functions.logger.debug(`Sending application submitted email to ${to}`)
  const html = applicationSubmitted();
  const info = await transporter.sendMail({
    from: process.env.SES_FROM_EMAIL,
    to,
    subject: 'Application Submitted - Garuda Hacks 7.0',
    html,
  });
  functions.logger.info('Application submitted email sent:', info.messageId);
}

export async function sendMentorshipBookedEmail(to: string, props: MentorshipEmailProps) {
  functions.logger.debug(`Sending mentorship booked email to ${to}`)
  const html = mentorshipBooked(props);
  const info = await transporter.sendMail({
    from: process.env.SES_FROM_EMAIL,
    to,
    subject: `Team ${props.teamName} Just Booked A Mentorship Session`,
    html,
  });
  functions.logger.info('Mentorship booked email sent:', info.messageId);
}

export async function sendMentorshipCanceledEmail(to: string, props: MentorshipEmailProps) {
  functions.logger.debug(`Sending mentorship canceled email to ${to}`)
  const html = mentorshipCanceled(props);
  const info = await transporter.sendMail({
    from: process.env.SES_FROM_EMAIL,
    to,
    subject: `Team ${props.teamName} Just Canceled A Mentorship Session`,
    html,
  });
  functions.logger.info('Mentorship canceled email sent:', info.messageId);
}