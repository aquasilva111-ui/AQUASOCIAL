import {useState} from 'react'
import {View} from 'react-native'
import {TID} from '@atproto/common-web'

import {getProvider} from '#/lib/launch-hub/providers'
import {type IdentityGroup, type ManagedProfile} from '#/lib/launch-hub/types'
import {useManagedProfiles} from '#/state/launch-hub/profiles'
import {useIdentityGroups} from '#/state/launch-hub/store'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import * as Toggle from '#/components/forms/Toggle'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Text} from '#/components/Typography'
import {Card, NoticeText, ProfileAvatar} from './components'

export function Identities() {
  const {groups, saveGroup, removeGroup} = useIdentityGroups()
  const {profiles} = useManagedProfiles()
  const [editing, setEditing] = useState<IdentityGroup | null>(null)

  return (
    <View style={[a.gap_md]}>
      <NoticeText>
        Uma identidade (pessoa ou marca) agrupa perfis de várias redes. No
        lançamento, escolher a identidade já seleciona os perfis dela.
      </NoticeText>

      {editing ? (
        <IdentityForm
          group={editing}
          profiles={profiles}
          onCancel={() => setEditing(null)}
          onSave={group => {
            saveGroup(group)
            setEditing(null)
          }}
        />
      ) : (
        <Button
          label="Nova identidade"
          size="small"
          color="primary"
          style={[a.self_start]}
          onPress={() =>
            setEditing({
              id: TID.nextStr(),
              name: '',
              profileKeys: [],
              createdAt: new Date().toISOString(),
            })
          }>
          <ButtonIcon icon={PlusIcon} />
          <ButtonText>Nova identidade</ButtonText>
        </Button>
      )}

      {groups.map(group => (
        <IdentityCard
          key={group.id}
          group={group}
          profiles={profiles}
          onEdit={() => setEditing(group)}
          onRemove={() => removeGroup(group.id)}
        />
      ))}
      {!groups.length && !editing && (
        <EmptyText>Nenhuma identidade ainda.</EmptyText>
      )}
    </View>
  )
}

function EmptyText({children}: {children: string}) {
  const t = useTheme()
  return (
    <Text
      style={[a.text_sm, a.py_lg, a.text_center, t.atoms.text_contrast_medium]}>
      {children}
    </Text>
  )
}

function IdentityCard({
  group,
  profiles,
  onEdit,
  onRemove,
}: {
  group: IdentityGroup
  profiles: ManagedProfile[]
  onEdit: () => void
  onRemove: () => void
}) {
  const t = useTheme()
  const members = group.profileKeys.map(key => ({
    key,
    profile: profiles.find(p => p.key === key),
  }))

  return (
    <Card>
      <View style={[a.flex_row, a.align_center, a.gap_sm]}>
        <Text style={[a.flex_1, a.text_md, a.font_bold]}>{group.name}</Text>
        <Button label="Editar" size="tiny" color="secondary" onPress={onEdit}>
          <ButtonText>Editar</ButtonText>
        </Button>
        <Button
          label="Remover identidade"
          size="tiny"
          color="negative_subtle"
          onPress={onRemove}>
          <ButtonText>Remover</ButtonText>
        </Button>
      </View>
      {members.map(({key, profile}) => (
        <View key={key} style={[a.flex_row, a.align_center, a.gap_sm]}>
          {profile && <ProfileAvatar profile={profile} size={24} />}
          <Text style={[a.text_sm]} numberOfLines={1}>
            {profile
              ? `${getProvider(profile.provider).name} — ${
                  profile.handle ? '@' + profile.handle : profile.displayName
                }`
              : 'Perfil desconectado'}
          </Text>
        </View>
      ))}
      {!members.length && (
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          Sem perfis.
        </Text>
      )}
    </Card>
  )
}

function IdentityForm({
  group,
  profiles,
  onSave,
  onCancel,
}: {
  group: IdentityGroup
  profiles: ManagedProfile[]
  onSave: (group: IdentityGroup) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(group.name)
  const [keys, setKeys] = useState(group.profileKeys)

  return (
    <Card>
      <View>
        <TextField.LabelText>Nome</TextField.LabelText>
        <TextField.Root>
          <TextField.Input
            label="Nome da identidade"
            placeholder="Ex.: AQUA, Samuel, Evergreen"
            value={name}
            onChangeText={setName}
          />
        </TextField.Root>
      </View>
      <Toggle.Group
        label="Perfis desta identidade"
        type="checkbox"
        values={keys}
        onChange={setKeys}>
        <View style={[a.gap_sm]}>
          {profiles.map(profile => (
            <Toggle.Item
              key={profile.key}
              name={profile.key}
              label={profile.displayName}>
              <Toggle.Checkbox />
              <ProfileAvatar profile={profile} size={24} />
              <Toggle.LabelText>
                {`${getProvider(profile.provider).name} — ${
                  profile.handle ? '@' + profile.handle : profile.displayName
                }`}
              </Toggle.LabelText>
            </Toggle.Item>
          ))}
        </View>
      </Toggle.Group>
      <View style={[a.flex_row, a.gap_sm, a.justify_end]}>
        <Button
          label="Cancelar"
          size="small"
          color="secondary"
          onPress={onCancel}>
          <ButtonText>Cancelar</ButtonText>
        </Button>
        <Button
          label="Salvar identidade"
          size="small"
          color="primary"
          disabled={!name.trim()}
          onPress={() =>
            onSave({...group, name: name.trim(), profileKeys: keys})
          }>
          <ButtonText>Salvar</ButtonText>
        </Button>
      </View>
    </Card>
  )
}
