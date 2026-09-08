import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { ArrowLeft, ImagePlus, Save, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  getProfilePhotosApi,
  type MobilePhotoUpload,
  type ProfilePhotoItem,
} from '../../src/api/profile-photos';
import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';
import { colors, radii, spacing } from '../../src/theme/tokens';

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export default function ProfilePhotosRoute() {
  const router = useRouter();
  const [existingPhotos, setExistingPhotos] = useState<ProfilePhotoItem[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<MobilePhotoUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getProfilePhotosApi().listPhotos().then((result) => {
      if (active) setExistingPhotos(result.items);
    }).catch(() => {
      if (active) setMessage('등록된 사진을 불러오지 못했어요. 다시 시도해 주세요.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function selectPhotos() {
    if (selecting || saving) return;
    setSelecting(true);
    setMessage(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setMessage('사진을 선택하려면 사진 보관함 접근을 허용해 주세요.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: MAX_PHOTOS,
        orderedSelection: true,
        quality: 0.9,
      });
      if (result.canceled) return;

      const uploads = result.assets.slice(0, MAX_PHOTOS).map(toMobileUpload);
      if (uploads.some((photo) => photo === null)) {
        setMessage('JPG, PNG, WEBP 형식의 10MB 이하 사진만 선택할 수 있어요.');
        return;
      }
      setSelectedPhotos(uploads as MobilePhotoUpload[]);
    } catch {
      setMessage('사진 선택 창을 열지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSelecting(false);
    }
  }

  async function savePhotos() {
    if (saving || selectedPhotos.length === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      await getProfilePhotosApi().replacePhotos(selectedPhotos);
      router.replace('/match');
    } catch {
      setMessage('사진을 저장하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteExistingPhoto(storagePath: string) {
    if (deletingPath || saving) return;
    setDeletingPath(storagePath);
    setMessage(null);
    try {
      await getProfilePhotosApi().deletePhoto(storagePath);
      setExistingPhotos((current) => current.filter((photo) => photo.storagePath !== storagePath));
    } catch {
      setMessage('사진을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDeletingPath(null);
    }
  }

  function confirmDelete(storagePath: string) {
    Alert.alert('사진 삭제', '이 사진을 프로필에서 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void deleteExistingPhoto(storagePath) },
    ]);
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.iconButton}>
          <ArrowLeft size={21} color={colors.ink} />
        </Pressable>
        <Text style={styles.step}>프로필 사진</Text>
      </View>

      <PageHeader
        eyebrow="본인 사진"
        title={'나를 보여줄 사진을\n골라주세요'}
        description="얼굴이 잘 보이는 사진을 최대 3장까지 등록할 수 있어요."
      />

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>등록된 사진</Text>
          <Text style={styles.count}>{existingPhotos.length}/{MAX_PHOTOS}</Text>
        </View>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.school} />
            <Text style={styles.loadingText}>사진을 불러오는 중</Text>
          </View>
        ) : existingPhotos.length > 0 ? (
          <View style={styles.photoGrid}>
            {existingPhotos.map((photo, index) => (
              <View key={photo.storagePath} style={styles.photoTile}>
                <Image source={{ uri: photo.signedUrl }} resizeMode="cover" style={styles.photo} />
                {index === 0 ? <Text style={styles.primaryBadge}>대표</Text> : null}
                <Pressable
                  accessibilityLabel={`등록 사진 ${index + 1} 삭제`}
                  disabled={Boolean(deletingPath)}
                  onPress={() => confirmDelete(photo.storagePath)}
                  style={styles.deleteButton}
                >
                  {deletingPath === photo.storagePath
                    ? <ActivityIndicator color={colors.surface} size="small" />
                    : <Trash2 size={17} color={colors.surface} />}
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>아직 등록된 사진이 없어요.</Text>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>새로 저장할 사진</Text>
          <Text style={styles.count}>{selectedPhotos.length}/{MAX_PHOTOS}</Text>
        </View>

        {selectedPhotos.length > 0 ? (
          <View style={styles.photoGrid}>
            {selectedPhotos.map((photo, index) => (
              <View key={`${photo.uri}-${index}`} style={styles.photoTile}>
                <Image source={{ uri: photo.uri }} resizeMode="cover" style={styles.photo} />
                {index === 0 ? <Text style={styles.primaryBadge}>대표</Text> : null}
                <Pressable
                  accessibilityLabel={`선택 사진 ${index + 1} 제외`}
                  onPress={() => setSelectedPhotos((current) => current.filter((_, target) => target !== index))}
                  style={styles.deleteButton}
                >
                  <Trash2 size={17} color={colors.surface} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.pickerEmpty}>
            <ImagePlus size={30} color={colors.school} />
            <Text style={styles.pickerEmptyTitle}>새 사진을 선택해 주세요</Text>
            <Text style={styles.pickerEmptyBody}>저장하면 현재 사진 전체가 새 선택으로 바뀝니다.</Text>
          </View>
        )}

        <Pressable
          disabled={selecting || saving}
          onPress={() => void selectPhotos()}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          {selecting ? <ActivityIndicator color={colors.school} /> : <ImagePlus size={19} color={colors.school} />}
          <Text style={styles.secondaryText}>{selectedPhotos.length > 0 ? '다시 선택' : '사진 선택'}</Text>
        </Pressable>
      </View>

      {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}

      <Pressable
        disabled={saving || selectedPhotos.length === 0}
        onPress={() => void savePhotos()}
        style={({ pressed }) => [
          styles.primaryButton,
          (saving || selectedPhotos.length === 0) && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        {saving ? <ActivityIndicator color={colors.surface} /> : <Save size={19} color={colors.surface} />}
        <Text style={styles.primaryText}>{saving ? '저장 중' : '전체 저장하고 매칭 보기'}</Text>
      </Pressable>
    </Screen>
  );
}

function toMobileUpload(asset: ImagePicker.ImagePickerAsset, index: number): MobilePhotoUpload | null {
  if (!asset.uri || (asset.fileSize != null && (asset.fileSize < 1 || asset.fileSize > MAX_PHOTO_BYTES))) return null;
  const type = readAllowedMimeType(asset.mimeType, asset.fileName ?? asset.uri);
  if (!type) return null;
  const extension = type === 'image/jpeg' ? 'jpg' : type.split('/')[1];
  return {
    uri: asset.uri,
    name: asset.fileName?.trim() || `quantum-profile-${index + 1}.${extension}`,
    type,
  };
}

function readAllowedMimeType(mimeType: string | null | undefined, fileName: string): MobilePhotoUpload['type'] | null {
  const normalized = mimeType?.toLowerCase() === 'image/jpg' ? 'image/jpeg' : mimeType?.toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/webp') return normalized;
  const extension = fileName.toLowerCase().split(/[?#]/)[0].split('.').pop();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return null;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  topRow: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  step: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  section: { marginTop: spacing.xl, paddingHorizontal: spacing.lg, gap: spacing.md },
  sectionHeading: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  count: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  loadingRow: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoTile: {
    width: '31%',
    maxWidth: 180,
    aspectRatio: 3 / 4,
    overflow: 'hidden',
    borderRadius: radii.card,
    backgroundColor: colors.surfaceMuted,
  },
  photo: { width: '100%', height: '100%' },
  primaryBadge: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    overflow: 'hidden',
    borderRadius: radii.control,
    backgroundColor: 'rgba(17,24,32,0.78)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    color: colors.surface,
    fontSize: 10,
    fontWeight: '900',
  },
  deleteButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 44,
    height: 44,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,24,32,0.74)',
  },
  emptyText: { minHeight: 60, color: colors.muted, fontSize: 13, fontWeight: '700' },
  pickerEmpty: {
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  pickerEmptyTitle: { marginTop: spacing.sm, color: colors.ink, fontSize: 14, fontWeight: '900' },
  pickerEmptyBody: { marginTop: 5, color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  secondaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.school,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
  },
  secondaryText: { color: colors.school, fontSize: 14, fontWeight: '900' },
  message: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    color: colors.action,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
  },
  primaryButton: {
    minHeight: 54,
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.control,
    backgroundColor: colors.school,
  },
  primaryText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.76 },
});
