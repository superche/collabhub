#!/usr/bin/env bash
set -euo pipefail

PROFILE="${ALIBABA_CLOUD_PROFILE:-collabhub-certification}"
REGION="${ALIBABA_CLOUD_REGION:-cn-hangzhou}"
for command in aliyun jq; do command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 1; }; done

CALLER=$(aliyun sts GetCallerIdentity --profile "$PROFILE" --RegionId "$REGION")
ACCOUNT_ALIAS=$(aliyun ram GetAccountAlias --profile "$PROFILE" --RegionId "$REGION" 2>/dev/null | jq -r '.AccountAlias // empty' || true)
IDENTITY_TYPE=$(printf '%s' "$CALLER" | jq -r '.IdentityType // "unknown"')
ARN=$(printf '%s' "$CALLER" | jq -r '.Arn // ""')
LOGIN_NAME=""
DISPLAY_NAME=""
EMAIL=""

if [[ "$IDENTITY_TYPE" == "RAMUser" && "$ARN" == *":user/"* ]]; then
  USER_NAME="${ARN##*:user/}"
  USER=$(aliyun ram GetUser --profile "$PROFILE" --RegionId "$REGION" --UserName "$USER_NAME" 2>/dev/null || true)
  if [[ -n "$USER" ]]; then
    LOGIN_NAME=$(printf '%s' "$USER" | jq -r '.User.UserName // .UserName // empty')
    DISPLAY_NAME=$(printf '%s' "$USER" | jq -r '.User.DisplayName // .DisplayName // empty')
    EMAIL=$(printf '%s' "$USER" | jq -r '.User.Email // .Email // empty')
  fi
fi

jq -n \
  --arg profile "$PROFILE" \
  --arg region "$REGION" \
  --arg accountId "$(printf '%s' "$CALLER" | jq -r '.AccountId // ""')" \
  --arg accountAlias "$ACCOUNT_ALIAS" \
  --arg identityType "$IDENTITY_TYPE" \
  --arg principalId "$(printf '%s' "$CALLER" | jq -r '.PrincipalId // ""')" \
  --arg arn "$ARN" \
  --arg loginName "$LOGIN_NAME" \
  --arg displayName "$DISPLAY_NAME" \
  --arg email "$EMAIL" \
  '{profile:$profile,region:$region,accountId:$accountId,accountAlias:(if ($accountAlias|length)>0 then $accountAlias else null end),identityType:$identityType,principalId:$principalId,arn:$arn,loginName:(if ($loginName|length)>0 then $loginName else null end),displayName:(if ($displayName|length)>0 then $displayName else null end),email:(if ($email|length)>0 then $email else null end),emailVisibility:(if ($email|length)>0 then "visible" else "not returned by STS/RAM for this principal" end)}'
