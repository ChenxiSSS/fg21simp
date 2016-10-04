# Copyright (c) 2016 Weitian LI <liweitianux@live.com>
# MIT license
#
# References:
# [1] https://configobj.readthedocs.io/en/latest/configobj.html
# [2] https://github.com/pazz/alot/blob/master/alot/settings/manager.py

"""
Configuration manager.
"""

import os
import sys
from glob import glob
import logging
from functools import reduce

from configobj import ConfigObj, ConfigObjError, flatten_errors
from validate import Validator

from ..errors import ConfigError


CONFIGS_PATH = os.path.dirname(__file__)
logger = logging.getLogger(__name__)


class ConfigManager:
    """Manager the configurations"""
    def __init__(self, configs=None):
        """Initialize the ConfigManager object with default configurations.
        If user configs are given, they are also validated and get merged.

        Parameters
        ----------
        configs: list (of config files)
            (optional) list of user config files to be merged
        """
        configs_spec = sorted(glob(os.path.join(CONFIGS_PATH, "*.conf.spec")))
        spec = "\n".join([open(f).read() for f in configs_spec]).split("\n")
        self._configspec = ConfigObj(spec, interpolation=False,
                                     list_values=False, _inspec=True)
        configs_default = ConfigObj(interpolation=False,
                                    configspec=self._configspec)
        self._config = self._validate(configs_default)
        logger.info("Loaded default configs with specification: {0}".format(
            ", ".join(configs_spec)))
        if configs:
            for config in configs:
                self.read_config(config)

    def read_config(self, config):
        """Read, validate and merge the input config.

        Parameters
        ----------
        config : str, list[str]
            Input config to be validated and merged.
            This parameter can be the filename of the config file, or a list
            contains the lines of the configs.
        """
        try:
            newconfig = ConfigObj(config, interpolation=False,
                                  configspec=self._configspec)
        except ConfigObjError as e:
            raise ConfigError(e)
        newconfig = self._validate(newconfig)
        self._config.merge(newconfig)
        logger.info("Loaded additional config: {0}".format(config))

    def read_userconfig(self, userconfig):
        """Read user configuration file, validate, and merge into the
        default configurations.

        Parameters
        ----------
        userconfig : filename
            Filename/path to the user configuration file.

        NOTE
        ----
        The user configuration file can be loaded *only once*,
        or *only one* user configuration file supported.
        Since the *path* of the user configuration file is recorded,
        and thus allow the use of *relative path* of some input files
        (e.g., galactic/synchrotron/template) within the configurations.
        """
        if hasattr(self, "userconfig"):
            raise ConfigError('User configuration already loaded from "%s"' %
                              self.userconfig)
        #
        try:
            config = open(userconfig).read().split("\n")
        except IOError:
            raise ConfigError('Cannot read config from "%s"' % userconfig)
        #
        self.read_config(config)
        self.userconfig = os.path.abspath(userconfig)
        logger.info("Loaded user config: {0}".format(userconfig))

    def _validate(self, config):
        """Validate the config against the specification using a default
        validator.  The validated config values are returned if success,
        otherwise, the ``ConfigError`` raised with details.
        """
        validator = Validator()
        try:
            results = config.validate(validator, preserve_errors=True)
        except ConfigObjError as e:
            raise ConfigError(e.message)
        if results is not True:
            error_msg = ""
            for (section_list, key, res) in flatten_errors(config, results):
                if key is not None:
                    if res is False:
                        msg = 'key "%s" in section "%s" is missing.'
                        msg = msg % (key, ", ".join(section_list))
                    else:
                        msg = 'key "%s" in section "%s" failed validation: %s'
                        msg = msg % (key, ", ".join(section_list), res)
                else:
                    msg = 'section "%s" is missing' % ".".join(section_list)
                error_msg += msg + "\n"
            raise ConfigError(error_msg)
        return config

    def get(self, key, fallback=None):
        """Get config value by key."""
        return self._config.get(key, fallback)

    def getn(self, keys, sep="/"):
        """Get the config value from the nested dictionary configs using
        a list of keys or a "sep"-separated keys strings.

        Parameters
        ----------
        keys : str / list[str]
            List of keys or a string separated by a specific character
            (e.g., "/") to specify the item in the `self._config`, which
            is a nested dictionary.
            e.g., `["section1", "key2"]`, `"section1/key2"`
        sep : str (len=1)
            If the above "keys" is a string, then this parameter specify
            the character used to separate the multi-level keys.

        References
        ----------
        - Stackoverflow: Checking a Dictionary using a dot notation string
          https://stackoverflow.com/q/12414821/4856091
        """
        if isinstance(keys, str):
            keys = keys.split(sep)
        return reduce(dict.get, keys, self._config)

    def get_path(self, keys):
        """Return the absolute path of the file/directory specified by the
        config keys.

        NOTE
        ----
        - The "~" (tilde) inside path is expanded to the user home directory.
        - The relative path (with respect to the user configuration file)
          is converted to absolute path if `self.userconfig` presents.
        """
        path = os.path.expanduser(self.getn(keys))
        if not os.path.isabs(path):
            # relative path
            if hasattr(self, "userconfig"):
                path = os.path.join(os.path.dirname(self.userconfig), path)
            else:
                # cannot convert to the absolute path
                logger.warning("Cannot convert to absolute path: %s" % path)
        return path

    @property
    def frequencies(self):
        """Get (calculate if necessary) )the frequencies at which to
        carry out the simulations.
        """
        if self.getn("frequency/type") == "custom":
            frequencies = self.getn("frequency/frequencies")
        else:
            # calculate the frequency values
            start = self.getn("frequency/start")
            stop = self.getn("frequency/stop")
            step = self.getn("frequency/step")
            num = int((stop - start) / step + 1)
            frequencies = [start + step*i for i in range(num)]
        return frequencies

    @property
    def logging(self):
        """Get and prepare the logging configurations for
        ``logging.basicConfig()`` to initialize the logging module.

        NOTE
        ----
        ``basicConfig()`` will automatically create a ``Formatter`` with
        the giving ``format`` and ``datefmt`` for each handlers if necessary,
        and then adding the handlers to the "root" logger.
        """
        from logging import FileHandler, StreamHandler
        conf = self.get("logging")
        # logging handlers
        handlers = []
        stream = conf["stream"]
        if stream:
            handlers.append(StreamHandler(getattr(sys, stream)))
        logfile = conf["filename"]
        filemode = conf["filemode"]
        if logfile:
            handlers.append(FileHandler(logfile, mode=filemode))
        #
        logconf = {
            "level": getattr(logging, conf["level"]),
            "format": conf["format"],
            "datefmt": conf["datefmt"],
            "filemode": filemode,
            "handlers": handlers,
        }
        return logconf
