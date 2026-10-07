(() => {
  "use strict";

  const legacy = Object.freeze({
    table: "locals",
    collectionProperty: "locals",
    idColumn: "local_id",
    deliveryLinkTable: "local_deliveries",
    userLinkTable: "user_locals",
    adminRole: "LOCAL_ADMIN",
    commercialTargetType: "LOCAL"
  });

  const canonical = Object.freeze({
    entity: "business",
    plural: "businesses",
    table: "businesses",
    userLinkTable: "user_businesses",
    deliveryLinkTable: "business_deliveries",
    idProperty: "businessId",
    idColumn: "business_id",
    adminRole: "BUSINESS_ADMIN",
    commercialTargetType: "BUSINESS"
  });

  function isBusinessAdminRole(role) {
    return role === canonical.adminRole || role === legacy.adminRole;
  }

  function toLegacyRole(role) {
    return role === canonical.adminRole ? legacy.adminRole : role;
  }

  function toCanonicalRole(role) {
    return role === legacy.adminRole ? canonical.adminRole : role;
  }

  function toLegacyTargetType(value) {
    return value === canonical.commercialTargetType ? legacy.commercialTargetType : value;
  }

  function toCanonicalTargetType(value) {
    return value === legacy.commercialTargetType ? canonical.commercialTargetType : value;
  }

  function businessIdOf(value) {
    return value?.business_id || value?.businessId || value?.local_id || value?.localId || value?.id || null;
  }

  window.HTPBusinessDomain = Object.freeze({
    canonical,
    legacy,
    isBusinessAdminRole,
    toLegacyRole,
    toCanonicalRole,
    toLegacyTargetType,
    toCanonicalTargetType,
    businessIdOf
  });
})();
