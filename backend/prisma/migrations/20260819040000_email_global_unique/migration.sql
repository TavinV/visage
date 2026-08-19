-- Email precisa ser único no sistema inteiro, não só por tenant.
-- Sem isso, a mesma pessoa podia ter uma conta em duas instituições
-- diferentes com o mesmo email, e o login (que já procura por email sem
-- filtrar tenant) pegava a conta errada de forma ambígua.

-- DropIndex
DROP INDEX "users_tenantId_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
