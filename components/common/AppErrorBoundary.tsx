import type { PropsWithChildren, ReactNode } from "react";
import { Component } from "react";
import { SafeAreaView, Text, View } from "react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { captureError } from "@/services/monitoring/errorService";

type Props = PropsWithChildren;
type State = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    void captureError({
      message: error.message,
      source: "react-boundary",
      stack: error.stack,
    });
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <SafeAreaView className="flex-1 bg-brisk-bg0 px-5 py-10">
        <View className="mx-auto mt-20 w-full max-w-[420px] rounded-3xl border border-[#27415A] bg-brisk-bg1 p-6">
          <Text className="text-[11px] uppercase tracking-[2px] text-brisk-subtext">Brisk</Text>
          <Text className="mt-3 text-2xl font-bold text-brisk-text">Something went wrong.</Text>
          <Text className="mt-2 text-sm leading-6 text-brisk-subtext">
            We logged the error. Reload the app and try again — your funds are safe on-chain.
          </Text>
          <View className="mt-5">
            <PrimaryButton label="Try again" onPress={() => this.setState({ hasError: false })} />
          </View>
        </View>
      </SafeAreaView>
    );
  }
}
