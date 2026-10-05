import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createRegionsWorkflow } from "@medusajs/medusa/core-flows";

// Aqua Shops: coloca o Brasil (BRL) no catálogo de demonstração.
// Só para desenvolvimento: o preço em reais é o preço em euro do seed vezes uma
// taxa fixa. Idempotente (pode rodar de novo).
const EUR_TO_BRL = 6;

export default async function seedBrl({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const storeModule = container.resolve(Modules.STORE);
  const regionModule = container.resolve(Modules.REGION);
  const pricingModule = container.resolve(Modules.PRICING);

  const [store] = await storeModule.listStores({}, { relations: ["supported_currencies"] });
  const current = store.supported_currencies ?? [];
  if (!current.some((c) => c.currency_code === "brl")) {
    await storeModule.updateStores(store.id, {
      supported_currencies: [
        ...current.map((c) => ({ currency_code: c.currency_code, is_default: false })),
        { currency_code: "brl", is_default: true },
      ],
    });
    logger.info("BRL adicionado como moeda padrão da loja.");
  }

  const regions = await regionModule.listRegions({ currency_code: "brl" });
  if (!regions.length) {
    const taken = await regionModule.listRegions({}, { relations: ["countries"] });
    if (taken.some((r) => r.countries?.some((c) => c.iso_2 === "br"))) {
      throw new Error("O país 'br' já pertence a outra região; remova-o de lá primeiro.");
    }
    await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Brasil",
            currency_code: "brl",
            countries: ["br"],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    });
    logger.info("Região Brasil criada.");
  }

  // Recria os preços em BRL espelhando cada preço em EUR, com as mesmas regras
  // (o preço de cada oferta é uma regra por vendedor/oferta).
  const all = await pricingModule.listPrices({}, { relations: ["price_rules"], take: 20000 });
  const stale = all.filter((p) => p.currency_code === "brl").map((p) => p.id);
  // `deletePrices` existe em runtime (gerado pelo MedusaService), mas falta nos tipos publicados.
  if (stale.length) await (pricingModule as unknown as { deletePrices(ids: string[]): Promise<void> }).deletePrices(stale);

  const bySet = new Map<string, typeof all>();
  for (const p of all) {
    if (p.currency_code !== "eur" || !p.price_set_id) continue;
    bySet.set(p.price_set_id, [...(bySet.get(p.price_set_id) ?? []), p]);
  }

  let added = 0;
  for (const [priceSetId, eurPrices] of bySet) {
    await pricingModule.addPrices({
      priceSetId,
      prices: eurPrices.map((p) => ({
        currency_code: "brl",
        amount: Math.round(Number(p.amount) * EUR_TO_BRL),
        min_quantity: p.min_quantity ?? undefined,
        max_quantity: p.max_quantity ?? undefined,
        rules: Object.fromEntries((p.price_rules ?? []).map((r) => [r.attribute, r.value])),
      })),
    });
    added += eurPrices.length;
  }
  logger.info(`Preços em BRL recriados: ${added} (removidos antes: ${stale.length}).`);
}
