<script setup lang="ts">
import { useTheme } from 'vuetify'
import { useAuthStore } from '@/stores/auth'
import logo from '@images/logo.svg?raw'
import authV1MaskDark from '@images/pages/auth-v1-mask-dark.png'
import authV1MaskLight from '@images/pages/auth-v1-mask-light.png'
import authV1Tree2 from '@images/pages/auth-v1-tree-2.png'
import authV1Tree from '@images/pages/auth-v1-tree.png'

const auth = useAuthStore()
const router = useRouter()
const session = useCookie<string | null>('re9_session', { sameSite: 'lax' })

const form = ref({
  username: '',
  email: '',
  password: '',
  privacyPolicies: false,
})

// No mock não há criação real de usuário: entra como Super Admin de demonstração.
// (Ao ligar o Supabase Auth, trocar por signUp real — ver docs/MELHORIAS.)
function onSubmit() {
  const id = auth.resolveByEmail('reno@re9.online')!

  session.value = id
  auth.setUser(id)
  router.push('/dashboard')
}

const vuetifyTheme = useTheme()

const authThemeMask = computed(() => {
  return vuetifyTheme.global.name.value === 'light'
    ? authV1MaskLight
    : authV1MaskDark
})

const isPasswordVisible = ref(false)

definePageMeta({ layout: 'blank' })
</script>

<template>
  <!-- eslint-disable vue/no-v-html -->

  <div class="auth-wrapper d-flex align-center justify-center pa-4">
    <VCard
      class="auth-card pa-4 pt-7"
      max-width="448"
    >
      <VCardItem class="justify-center">
        <NuxtLink
          to="/"
          class="d-flex align-center gap-3"
        >
          <!-- eslint-disable vue/no-v-html -->
          <div
            class="d-flex"
            v-html="logo"
          />
          <h2 class="font-weight-medium text-2xl text-uppercase">
            RE9 Finanças
          </h2>
        </NuxtLink>
      </VCardItem>

      <VCardText class="pt-2">
        <h4 class="text-h4 mb-1">
          Crie sua conta 🚀
        </h4>
        <p class="mb-0">
          Gestão financeira simples e centralizada
        </p>
      </VCardText>

      <VCardText>
        <VForm @submit.prevent="onSubmit">
          <VRow>
            <!-- Nome -->
            <VCol cols="12">
              <VTextField
                :id="useId()"
                v-model="form.username"
                label="Nome"
                placeholder="Seu nome"
              />
            </VCol>
            <!-- email -->
            <VCol cols="12">
              <VTextField
                :id="useId()"
                v-model="form.email"
                label="E-mail"
                placeholder="voce@empresa.com.br"
                type="email"
              />
            </VCol>

            <!-- senha -->
            <VCol cols="12">
              <VTextField
                :id="useId()"
                v-model="form.password"
                label="Senha"
                placeholder="············"
                :type="isPasswordVisible ? 'text' : 'password'"
                autocomplete="new-password"
                :append-inner-icon="isPasswordVisible ? 'ri-eye-off-line' : 'ri-eye-line'"
                @click:append-inner="isPasswordVisible = !isPasswordVisible"
              />
              <div class="d-flex align-center flex-wrap my-6">
                <VCheckbox
                  id="privacy-policy"
                  v-model="form.privacyPolicies"
                  inline
                />
                <VLabel
                  for="privacy-policy"
                  style="opacity: 1; white-space: normal;"
                >
                  <span class="me-1">Concordo com a</span>
                  <span class="text-primary">política de privacidade e os termos</span>
                </VLabel>
              </div>

              <VBtn
                block
                type="submit"
              >
                Cadastrar
              </VBtn>
            </VCol>

            <!-- entrar -->
            <VCol
              cols="12"
              class="text-center text-base"
            >
              <span>Já tem uma conta?</span>
              <NuxtLink
                class="text-primary ms-2"
                to="/login"
              >
                Entrar
              </NuxtLink>
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
    </VCard>

    <VImg
      class="auth-footer-start-tree d-none d-md-block"
      :src="authV1Tree"
      :width="250"
    />

    <VImg
      :src="authV1Tree2"
      class="auth-footer-end-tree d-none d-md-block"
      :width="350"
    />

    <!-- bg img -->
    <VImg
      class="auth-footer-mask d-none d-md-block"
      :src="authThemeMask"
    />
  </div>
</template>

<style lang="scss">
@use "@core/scss/template/pages/page-auth";
</style>
