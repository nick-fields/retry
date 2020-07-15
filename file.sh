LAST_ATTEMPT=$(touch ./last_attempt && cat ./last_attempt)
echo LAST_ATTEMPT=$LAST_ATTEMPT

if [ $LAST_ATTEMPT = 'true' ]; then
  exit 0
else
  exit 1
fi
