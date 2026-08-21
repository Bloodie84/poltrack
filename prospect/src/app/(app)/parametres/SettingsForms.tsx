'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { clearHomePoint, updateProfile, updateSettings } from './actions';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Select, TextInput, Toggle } from '@/components/ui/Field';
import { IDLE, type ActionState } from '@/lib/forms';
import type { UserSettingsRow } from '@/lib/supabase/types';

export type SettingsFormsProps = {
  email: string;
  displayName: string;
  settings: Omit<UserSettingsRow, 'created_at' | 'updated_at'>;
  homePointLabel: string | null;
};

function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? 'Enregistrement…' : children}
    </Button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.status === 'idle') return null;
  return (
    <p
      role="status"
      className={`text-sm ${state.status === 'error' ? 'text-danger' : 'text-success'}`}
    >
      {state.message}
    </p>
  );
}

export function SettingsForms({
  email,
  displayName,
  settings,
  homePointLabel,
}: SettingsFormsProps) {
  const [profileState, profileAction] = useActionState(updateProfile, IDLE);
  const [settingsState, settingsAction] = useActionState(updateSettings, IDLE);
  const [homeState, homeAction] = useActionState(clearHomePoint, IDLE);

  return (
    <div className="space-y-5">
      <Card title="Compte">
        <form action={profileAction} className="space-y-4">
          <Field label="Adresse e-mail" hint="Sert d’identifiant, non modifiable ici.">
            <TextInput value={email} readOnly disabled />
          </Field>

          <Field label="Nom affiché" error={profileState.fieldErrors?.display_name}>
            <TextInput
              name="display_name"
              defaultValue={displayName}
              maxLength={80}
              placeholder="Votre nom"
            />
          </Field>

          <div className="flex items-center gap-3">
            <SubmitButton>Enregistrer</SubmitButton>
            <Feedback state={profileState} />
          </div>
        </form>

        <form action="/auth/deconnexion" method="post" className="mt-5 border-t border-line pt-5">
          <Button type="submit" variant="danger">
            Se déconnecter
          </Button>
        </form>
      </Card>

      <Card
        title="Prospection"
        description="La largeur de balayage servira à calculer les surfaces réellement couvertes (phase 4)."
      >
        <form action={settingsAction} className="space-y-4">
          <Field
            label="Largeur de prospection par défaut (m)"
            hint="Largeur balayée de part et d’autre de votre trace. Entre 0,20 et 10 m."
            error={settingsState.fieldErrors?.default_sweep_width_m}
          >
            <TextInput
              name="default_sweep_width_m"
              type="number"
              step="0.1"
              min="0.2"
              max="10"
              defaultValue={settings.default_sweep_width_m}
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Unités">
              <Select name="units" defaultValue={settings.units}>
                <option value="metric">Métrique (m, km, ha)</option>
                <option value="imperial">Impérial (ft, mi, ac)</option>
              </Select>
            </Field>

            <Field label="Confidentialité par défaut">
              <Select name="default_privacy" defaultValue={settings.default_privacy}>
                <option value="private">Privé</option>
                <option value="friends">Amis</option>
                <option value="shared">Partagé</option>
              </Select>
            </Field>

            <Field label="Langue">
              <Select name="locale" defaultValue={settings.locale}>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </Select>
            </Field>

            <Field label="Thème" hint="Seul le thème sombre est implémenté pour l’instant.">
              <Select name="theme" defaultValue={settings.theme}>
                <option value="dark">Sombre</option>
                <option value="light">Clair</option>
                <option value="system">Système</option>
              </Select>
            </Field>
          </div>

          <fieldset className="space-y-3 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-medium text-ink-1">
              Échantillonnage GPS
            </legend>
            <p className="text-xs leading-relaxed text-ink-2">
              Un point est retenu lorsque l’intervalle <em>et</em> la distance minimale sont
              atteints. Ces réglages seront appliqués à l’enregistrement des traces (phase 2).
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Intervalle min. (s)"
                error={settingsState.fieldErrors?.gps_min_interval_s}
              >
                <TextInput
                  name="gps_min_interval_s"
                  type="number"
                  min="1"
                  max="60"
                  step="1"
                  defaultValue={settings.gps_min_interval_s}
                  required
                />
              </Field>

              <Field
                label="Distance min. (m)"
                error={settingsState.fieldErrors?.gps_min_distance_m}
              >
                <TextInput
                  name="gps_min_distance_m"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  defaultValue={settings.gps_min_distance_m}
                  required
                />
              </Field>

              <Field
                label="Incertitude max. (m)"
                error={settingsState.fieldErrors?.gps_max_accuracy_m}
              >
                <TextInput
                  name="gps_max_accuracy_m"
                  type="number"
                  min="1"
                  max="500"
                  step="1"
                  defaultValue={settings.gps_max_accuracy_m}
                  required
                />
              </Field>
            </div>
          </fieldset>

          <Toggle
            name="keep_screen_awake"
            label="Garder l’écran allumé pendant une sortie"
            hint="Utilisé à partir de la phase 2, via l’API Screen Wake Lock quand le navigateur la propose."
            defaultChecked={settings.keep_screen_awake}
          />

          <div className="flex items-center gap-3">
            <SubmitButton>Enregistrer</SubmitButton>
            <Feedback state={settingsState} />
          </div>
        </form>
      </Card>

      <Card
        title="Point d’ouverture de la carte"
        description="La carte s’ouvre sur ce point. Il se définit depuis l’écran Carte, panneau GPS."
      >
        {homePointLabel ? (
          <div className="space-y-3">
            <p className="font-mono text-sm text-ink-0">{homePointLabel}</p>
            <form action={homeAction} className="flex items-center gap-3">
              <Button type="submit" variant="secondary">
                Effacer
              </Button>
              <Feedback state={homeState} />
            </form>
          </div>
        ) : (
          <p className="text-sm text-ink-2">
            Aucun point défini : la carte s’ouvre sur la France entière.
          </p>
        )}
      </Card>
    </div>
  );
}
