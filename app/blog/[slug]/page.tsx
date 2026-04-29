import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BlogArticlePage } from "@/components/blog/BlogArticlePage";
import { blogPosts, getBlogPost, getBlogPostUrl } from "@/lib/blog/posts";
import { buildArticleMetadata } from "@/lib/seo";

type BlogArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: BlogArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    return {};
  }

  return buildArticleMetadata({
    title: post.seoTitle,
    description: post.seoDescription,
    path: getBlogPostUrl(post.slug),
  });
}

export default async function BlogArticleRoute({ params }: BlogArticlePageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    notFound();
  }

  return <BlogArticlePage post={post} />;
}
