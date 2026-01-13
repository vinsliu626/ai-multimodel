// lib/stripe.ts
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // 如果你本地提示不同，就删掉 apiVersion 也能跑
});
