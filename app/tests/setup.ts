// #255: timeout global de waitFor/findBy generoso. Sob paralelismo (forks), a
// CPU satura e os recomputes assíncronos pesados (re-extração de regras dispara
// por toggle/click) às vezes passam de 1000ms (o default do testing-library),
// estourando o waitFor e causando flake não-determinístico. 5s dá folga sem
// mascarar travamento real — o testTimeout=20s (vitest.config) ainda pega
// deadlock de verdade. Cobre a CLASSE de testes sensíveis a tempo de uma vez,
// em vez de anotar timeout em cada waitFor.
import { configure } from '@testing-library/react'

configure({ asyncUtilTimeout: 5000 })
