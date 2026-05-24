export const sendEmail = async (opts: {
  to: string;
  subject: string;
  content: string;
}): Promise<void> => {
  const { to, subject, content } = opts;

  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log(
    `Sending email to ${to} with subject ${subject} and body ${content}`,
  );
};
