import { Modal, Pressable, Text, View } from "react-native";

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  body: string;
};

export function InfoModal({ visible, onClose, title, body }: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/70 px-6">
        <View className="w-full rounded-2xl bg-fathom-bg1 p-5">
          <Text className="text-lg font-semibold text-fathom-text">{title}</Text>
          <Text className="mt-2 text-sm text-fathom-subtext">{body}</Text>
          <Pressable onPress={onClose} className="mt-5 rounded-lg bg-fathom-bull px-4 py-2">
            <Text className="text-center font-semibold text-[#07111A]">Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
