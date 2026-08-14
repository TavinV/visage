"use client";

import { Avatar } from "@/components/ui";
import { useAuthenticatedImage } from "@/lib/useAuthenticatedImage";

interface UserAvatarProps {
  userId: string;
  name: string;
  hasPhoto?: boolean;
  photoUpdatedAt?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

/**
 * Avatar que busca a foto de perfil autenticada.
 *
 * Existe como componente (e não como hook no chamador) porque a foto aparece
 * dentro de listas: um hook por linha só é possível se cada linha for um
 * componente. Sem foto, não há request — cai direto nas iniciais.
 */
export function UserAvatar({
  userId,
  name,
  hasPhoto,
  photoUpdatedAt,
  size = "sm",
  className,
}: UserAvatarProps) {
  const url = useAuthenticatedImage(`/users/${userId}/photo`, {
    enabled: hasPhoto ?? false,
    cacheKey: photoUpdatedAt,
  });

  return <Avatar name={name} size={size} src={url} className={className} />;
}
