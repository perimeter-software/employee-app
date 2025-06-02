import { usePageAuth } from "@/domains/shared";
import { ReactNode } from "react";
import { NextPage, GetServerSideProps, GetStaticProps } from "next";
import {
  AuthErrorState,
  AuthLoadingState,
  UnauthenticatedState,
} from "@/components/shared/PageProtection";

type WithAuthOptions = {
  requireAuth?: boolean;
  fallback?: ReactNode;
};

export function withAuth<
  P extends Record<string, unknown> = Record<string, unknown>
>(WrappedComponent: NextPage<P>, options: WithAuthOptions = {}) {
  const { requireAuth = true, fallback } = options;

  const WithAuth: NextPage<P> = (props) => {
    const { shouldShowContent, isLoading, error } = usePageAuth({
      requireAuth,
    });

    if (isLoading) {
      return fallback || <AuthLoadingState />;
    }

    if (error) {
      return fallback || <AuthErrorState error={error.message} />;
    }

    if (!shouldShowContent) {
      return fallback || <UnauthenticatedState />;
    }

    return <WrappedComponent {...props} />;
  };

  // Copy static methods if they exist
  if (WrappedComponent.getInitialProps) {
    WithAuth.getInitialProps = WrappedComponent.getInitialProps;
  }

  // Copy getServerSideProps if it exists
  if ("getServerSideProps" in WrappedComponent) {
    (
      WithAuth as NextPage<P> & { getServerSideProps: GetServerSideProps<P> }
    ).getServerSideProps = (
      WrappedComponent as NextPage<P> & {
        getServerSideProps: GetServerSideProps<P>;
      }
    ).getServerSideProps;
  }

  // Copy getStaticProps if it exists
  if ("getStaticProps" in WrappedComponent) {
    (
      WithAuth as NextPage<P> & { getStaticProps: GetStaticProps<P> }
    ).getStaticProps = (
      WrappedComponent as NextPage<P> & { getStaticProps: GetStaticProps<P> }
    ).getStaticProps;
  }

  return WithAuth;
}
