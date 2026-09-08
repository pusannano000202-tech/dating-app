import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Camera, CheckCircle2, ImagePlus, ShieldCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getMeetingAlbumApi,
  MeetingAlbumApiError,
  type MeetingAlbum,
  type MeetingEvidenceUpload,
} from '../../../src/api/meeting-album';
import { Screen } from '../../../src/components/Screen';
import { colors, radii, spacing } from '../../../src/theme/tokens';

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

export default function MeetingAlbumRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ matchId?: string }>();
  const matchId = typeof params.matchId === 'string' ? params.matchId : '';
  const [album, setAlbum] = useState<MeetingAlbum | null>(null);
  const [selected, setSelected] = useState<MeetingEvidenceUpload | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadAlbum() {
    if (!matchId) return;
    try {
      setAlbum(await getMeetingAlbumApi().getAlbum(matchId));
    } catch {
      setMessage('만남 사진첩을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAlbum();
  // loadAlbum is intentionally keyed by the route id only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  async function choosePhoto() {
    setMessage(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage('사진을 고르려면 사진 보관함 접근을 허용해 주세요.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    const upload = toUpload(result.assets[0]);
    if (!upload) {
      setMessage('JPG, PNG, WEBP 형식의 12MB 이하 사진을 골라 주세요.');
      return;
    }
    setSelected(upload);
  }

  async function uploadEvidence() {
    if (!selected || !matchId || uploading) return;
    setUploading(true);
    setMessage(null);
    try {
      await getMeetingAlbumApi().uploadEvidence(matchId, selected);
      setSelected(null);
      setMessage('참가 사진을 저장했어요. 함께 만난 사람들의 앨범에도 보여요.');
      await loadAlbum();
    } catch (error) {
      setMessage(
        error instanceof MeetingAlbumApiError && error.code === 'evidence_already_submitted'
          ? '이미 이 만남의 사진을 올렸어요. 참가자 앨범에서 확인해 주세요.'
          : '사진을 저장하지 못했어요. 등록 시간과 연결 상태를 확인해 주세요.',
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.iconButton}>
          <ArrowLeft size={22} color={colors.surface} />
        </Pressable>
        <Text style={styles.eyebrow}>MEETING ALBUM</Text>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.title}>오늘의 사진을 함께 남겨요</Text>
          <Text style={styles.description}>참가 확인과 참가자 앨범에 함께 저장돼요.</Text>
        </View>
        <View style={styles.cameraIcon}><Camera size={23} color={colors.surface} /></View>
      </View>

      <View style={styles.statusRow}>
        <View style={styles.statusItem}>
          <CheckCircle2 size={17} color={colors.school} />
          <Text style={styles.statusText}>{album?.operations.canUploadEvidence ? '지금 등록 가능' : '등록 시간 확인 중'}</Text>
        </View>
        <View style={styles.statusItem}>
          <ShieldCheck size={17} color={colors.safety} />
          <Text style={styles.statusText}>참가자만 열람</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.school} /></View>
      ) : album?.photos.length ? (
        <View style={styles.photoGrid}>
          {album.photos.map((photo) => (
            <View key={photo.id} style={styles.photoTile}>
              <Image source={{ uri: photo.signedUrl }} resizeMode="cover" style={styles.photo} />
              {photo.mine ? <Text style={styles.mineBadge}>내가 올림</Text> : null}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <ImagePlus size={28} color={colors.school} />
          <Text style={styles.emptyTitle}>아직 함께 남긴 사진이 없어요</Text>
          <Text style={styles.emptyBody}>첫 사진을 올리면 참가자 앨범이 시작돼요.</Text>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          disabled={!album?.operations.canUploadEvidence || uploading}
          onPress={() => void choosePhoto()}
          style={({ pressed }) => [styles.chooseButton, pressed && styles.pressed]}
        >
          <ImagePlus size={18} color={colors.school} />
          <Text style={styles.chooseText}>{selected ? selected.name : '사진 고르기'}</Text>
        </Pressable>
        <Pressable
          disabled={!selected || uploading}
          onPress={() => void uploadEvidence()}
          style={({ pressed }) => [styles.uploadButton, (!selected || uploading) && styles.disabled, pressed && styles.pressed]}
        >
          {uploading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.uploadText}>앨범에 올리기</Text>}
        </Pressable>
      </View>

      <Text style={styles.safetyCopy}>사진 한 장만으로 보증금 제재를 결정하지 않아요. 신고는 별도 안전 절차로 확인해요.</Text>
      {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
    </Screen>
  );
}

function toUpload(asset: ImagePicker.ImagePickerAsset): MeetingEvidenceUpload | null {
  if (!asset.uri || (asset.fileSize != null && (asset.fileSize <= 0 || asset.fileSize > MAX_PHOTO_BYTES))) return null;
  const type = readMimeType(asset.mimeType, asset.fileName ?? asset.uri);
  if (!type) return null;
  const extension = type === 'image/jpeg' ? 'jpg' : type.split('/')[1];
  return { uri: asset.uri, name: asset.fileName?.trim() || `quantum-meeting.${extension}`, type };
}

function readMimeType(mimeType: string | null | undefined, fileName: string): MeetingEvidenceUpload['type'] | null {
  const normalized = mimeType?.toLowerCase() === 'image/jpg' ? 'image/jpeg' : mimeType?.toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/webp') return normalized;
  const extension = fileName.toLowerCase().split(/[?#]/)[0].split('.').pop();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return null;
}

const styles = StyleSheet.create({
  content: { minHeight: '100%', backgroundColor: '#101820', paddingBottom: spacing.xxl },
  topRow: { minHeight: 58, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#F6BA5C', fontSize: 12, fontWeight: '900' },
  hero: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, flexDirection: 'row', alignItems: 'flex-start' },
  heroCopy: { flex: 1 },
  title: { color: colors.surface, fontSize: 26, lineHeight: 33, fontWeight: '900' },
  description: { marginTop: spacing.sm, color: '#C2CBD0', fontSize: 14, lineHeight: 21, fontWeight: '700' },
  cameraIcon: { width: 48, height: 48, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: '#25333D' },
  statusRow: { marginHorizontal: spacing.lg, flexDirection: 'row', gap: spacing.sm },
  statusItem: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.card, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  statusText: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: '800' },
  loading: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  photoGrid: { marginTop: spacing.lg, paddingHorizontal: spacing.lg, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoTile: { width: '48%', aspectRatio: 4 / 3, overflow: 'hidden', borderRadius: radii.card, backgroundColor: colors.surfaceMuted },
  photo: { width: '100%', height: '100%' },
  mineBadge: { position: 'absolute', left: 8, bottom: 8, overflow: 'hidden', borderRadius: radii.round, backgroundColor: 'rgba(16,24,32,0.78)', paddingHorizontal: 8, paddingVertical: 5, color: colors.surface, fontSize: 10, fontWeight: '900' },
  empty: { minHeight: 220, marginTop: spacing.lg, marginHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', borderRadius: radii.card, backgroundColor: colors.surface, padding: spacing.lg },
  emptyTitle: { marginTop: spacing.sm, color: colors.ink, fontSize: 16, fontWeight: '900' },
  emptyBody: { marginTop: 5, color: colors.muted, fontSize: 12, textAlign: 'center' },
  actions: { marginTop: spacing.lg, paddingHorizontal: spacing.lg, gap: spacing.sm },
  chooseButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.control, backgroundColor: colors.surface },
  chooseText: { maxWidth: '78%', color: colors.school, fontSize: 14, fontWeight: '900' },
  uploadButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: radii.control, backgroundColor: colors.action },
  uploadText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
  safetyCopy: { marginTop: spacing.md, paddingHorizontal: spacing.lg, color: '#AEBBC1', fontSize: 11, lineHeight: 18 },
  message: { marginTop: spacing.md, paddingHorizontal: spacing.lg, color: '#F6BA5C', fontSize: 12, lineHeight: 18, fontWeight: '800' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
});
