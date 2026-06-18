import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  YUKASSA_SHOP_ID: z.string().min(1),
  YUKASSA_SECRET_KEY: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  ANTHROPIC_API_KEY: z.string().min(1),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const missing = Array.from(
    new Set(
      parsedEnv.error.issues
        .map((issue) => issue.path[0])
        .filter((name): name is string => typeof name === "string")
    )
  );

  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}`
  );
}

export const env = parsedEnv.data;
